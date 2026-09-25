// swift-tools-version: 6.0
import PackageDescription

// Long-lived Laya decision-model helper for the router. The desktop main process
// talks to it over stdin/stdout with one JSON object per line.
let package = Package(
  name: "LayaHelper",
  platforms: [.macOS(.v14)],
  dependencies: [
    // Pinned to the commit whose LayaManager API this helper was written against;
    // the published tags predate that API.
    .package(
      url: "https://github.com/FluidInference/FluidUse.git",
      revision: "e0d4215ae395a877e9d11bbb75bb26413137ab05")
  ],
  targets: [
    .executableTarget(
      name: "routey-laya-helper",
      dependencies: [.product(name: "FluidUse", package: "FluidUse")],
      path: "Sources/LayaHelper")
  ]
)
