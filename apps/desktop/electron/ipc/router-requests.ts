import { desktopIpc } from "../../contracts/ipc";
import { decodeRouterConfig } from "../../contracts/router";
import type { RouterOwner } from "../router/router-owner";
import type { MainFrameHandler } from "./main-frame-ipc";
import { expectSessionTarget } from "./request-validation";

export type RouterRequestsOwner = Pick<RouterOwner, "sessionInfo" | "overview" | "setConfig">;

export function registerRouterRequests(handle: MainFrameHandler, owner: RouterRequestsOwner): void {
  handle(desktopIpc.getRouterSessionInfo, expectSessionTarget, (target) =>
    owner.sessionInfo(target),
  );
  handle(
    desktopIpc.getRouterOverview,
    () => undefined,
    () => owner.overview(),
  );
  handle(desktopIpc.setRouterConfig, decodeRouterConfig, (config) => owner.setConfig(config));
}
