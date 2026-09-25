import Foundation
import FluidUse

// Protocol: one JSON object per line on stdin and stdout.
//
// Events (helper → app, no id):
//   {"event":"loading"}                   weights are loading
//   {"event":"ready","lengths":[128,512]} ready for requests
//   {"event":"unavailable","message":"…"} weights missing or failed to load; requests fail
//
// Requests (app → helper):
//   {"id":"1","state":"…","questions":[{"key":"taskKind","type":"choice",
//     "instructions":"…","options":[["coding","writes or changes code"],["general"]]}]}
// Responses:
//   {"id":"1","ms":12.5,"answers":[{"key":"taskKind","labels":["coding","general"],
//     "probabilities":[0.9,0.1],"selected":"coding","confidence":0.7,"truncated":false}]}
//   {"id":"1","error":"…"}
//
// The helper never downloads weights unless started with --allow-download.

struct WireQuestion: Decodable {
  let key: String
  let type: String
  let instructions: String
  let options: [[String?]]?
}

struct WireRequest: Decodable {
  let id: String
  let state: String
  let questions: [WireQuestion]
}

let output = FileHandle.standardOutput
let outputLock = NSLock()

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object, options: []) else { return }
  outputLock.lock()
  output.write(data)
  output.write(Data([0x0A]))
  outputLock.unlock()
}

func loadManager(allowDownload: Bool) async -> LayaManager? {
  emit(["event": "loading"])
  do {
    let manager: LayaManager
    if allowDownload {
      manager = try await LayaManager.load()
    } else {
      let directory = LayaModelStore.defaultCacheDirectory().appendingPathComponent(
        "laya-coreml", isDirectory: true)
      manager = try await LayaManager.load(from: directory)
    }
    emit(["event": "ready", "lengths": manager.lengths])
    return manager
  } catch {
    emit(["event": "unavailable", "message": error.localizedDescription])
    return nil
  }
}

func answer(_ request: WireRequest, with manager: LayaManager) async -> [String: Any] {
  do {
    let questions = try request.questions.map { question in
      try LayaQuestion(
        type: question.type, instructions: question.instructions, options: question.options ?? [])
    }
    let start = DispatchTime.now().uptimeNanoseconds
    let answers = try await manager.answer(state: request.state, questions: questions)
    let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    let wireAnswers: [[String: Any]] = zip(request.questions, answers).map { question, answer in
      [
        "key": question.key,
        "labels": answer.question.labels,
        "probabilities": answer.probabilities.map { Double($0) },
        "selected": answer.selectedLabel,
        "confidence": Double(answer.confidence),
        "truncated": answer.stateWasTruncated,
      ]
    }
    return ["id": request.id, "ms": elapsed, "answers": wireAnswers]
  } catch {
    return ["id": request.id, "error": error.localizedDescription]
  }
}

let allowDownload = CommandLine.arguments.contains("--allow-download")
let manager = await loadManager(allowDownload: allowDownload)
let decoder = JSONDecoder()

while let line = readLine(strippingNewline: true) {
  if line.isEmpty { continue }
  guard let request = try? decoder.decode(WireRequest.self, from: Data(line.utf8)) else {
    emit(["error": "Malformed request"])
    continue
  }
  guard let manager else {
    emit(["id": request.id, "error": "Laya is unavailable"])
    continue
  }
  emit(await answer(request, with: manager))
}
