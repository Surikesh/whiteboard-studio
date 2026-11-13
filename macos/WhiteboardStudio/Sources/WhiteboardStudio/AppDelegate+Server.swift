import AppKit

extension AppDelegate {
  // MARK: Server

  func pollServer() {
    guard !isCheckingServer else { return }
    isCheckingServer = true
    Task {
      if await server.refresh() { retargetLocalTabs() }
      isCheckingServer = false
    }
  }

  /// After sleep the supervisor re-checks the link itself (with its grace period); just refresh the view.
  func systemDidWake() {
    pollServer()
  }

  /// The quick tunnel got a new address: move tabs off the old one and tell the user.
  func tunnelChanged(to url: URL, userInitiated: Bool) {
    for board in boards where LabConfig.isTunnel(board.url) {
      if let host = board.url.host, server.oldTunnelHosts.contains(host) {
        board.navigate(to: LabConfig.rebase(board.url, onto: LabConfig.sharedOrigin))
      }
    }
    sessionChanged()
    // Skip the notice while another sheet is up; sheets would queue up behind each other.
    guard !userInitiated, let window, window.attachedSheet == nil else { return }
    let link = publicLinkForCurrentBoard ?? url
    let alert = NSAlert()
    alert.messageText = "The Cloudflare link has changed"
    alert.informativeText = link.absoluteString
    alert.addButton(withTitle: "Copy link")
    alert.addButton(withTitle: "Close")
    alert.beginSheetModal(for: window) { response in
      if response == .alertFirstButtonReturn { Self.copy(link.absoluteString) }
    }
  }

  /// Called by a tab whose local server does not answer.
  func serverUnavailable() {
    guard !isCheckingServer else { return }
    isCheckingServer = true
    Task {
      if await server.refresh() {
        retargetLocalTabs()
      } else if server.mode == .local {
        server.ensureLocalServer()
      }
      isCheckingServer = false
    }
  }

  func retargetLocalTabs() {
    for board in boards where LabConfig.isLocal(board.url) {
      if let port = board.url.port, LabConfig.labPorts.contains(port) {
        board.navigate(to: LabConfig.rebase(board.url, onto: server.localOrigin))
      }
    }
    sessionChanged()
  }

  /// Moves a tab from an unreachable non-lab local port to the current lab server; false if not applicable.
  func retargetToLabServer(_ board: Board) -> Bool {
    guard LabConfig.isLocal(board.url), let port = board.url.port, !LabConfig.labPorts.contains(port) else { return false }
    let target = LabConfig.rebase(board.url, onto: server.localOrigin)
    guard target != board.url else { return false }
    board.navigate(to: target)
    sessionChanged()
    return true
  }

  func serverChanged() {
    tabBar.update(server: .init(
      shared: server.mode == .shared,
      publicURL: server.publicURL,
      agentEnabled: server.agentEnabled,
      agentBusy: server.agentBusy,
      agentModel: server.agentModel,
      task: server.task,
      status: Self.shareStatusText(server),
      health: server.health,
      recoveryGaveUp: server.recoveryGaveUp
    ))
  }
}
