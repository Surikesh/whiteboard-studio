import AppKit

extension AppDelegate {
  var publicLinkForCurrentBoard: URL? {
    guard let origin = server.publicURL else { return nil }
    let path = selectedBoard.map { LabConfig.isLocal($0.url) ? $0.url.path : "/" } ?? "/"
    return URL(string: path, relativeTo: origin)?.absoluteURL
  }

  /// Same menu for a left click in shared mode and for a right click in any mode.
  func cloudMenu() -> NSMenu? {
    let menu = NSMenu()
    guard server.mode == .shared else {
      menu.addItem(ClosureMenuItem("Share via Cloudflare…") { [weak self] in self?.confirmSharing() })
      return menu
    }
    if let link = publicLinkForCurrentBoard {
      let header = NSMenuItem(title: link.host ?? "", action: nil, keyEquivalent: "")
      header.isEnabled = false
      menu.addItem(header)
      menu.addItem(ClosureMenuItem("Copy link address") { Self.copy(link.absoluteString) })
      menu.addItem(ClosureMenuItem("Open link in browser") { NSWorkspace.shared.open(link) })
      menu.addItem(.separator())
    }
    menu.addItem(ClosureMenuItem("Stop sharing via Cloudflare") { [weak self] in self?.stopSharing() })
    return menu
  }

  func cloudPressed(_ anchor: NSView) {
    server.resetRecovery()
    if server.mode == .shared {
      cloudMenu()?.popUp(positioning: nil, at: NSPoint(x: 0, y: anchor.bounds.height + 4), in: anchor)
    } else {
      confirmSharing()
    }
  }

  private func confirmSharing() {
    let alert = NSAlert()
    alert.messageText = "Share via Cloudflare?"
    alert.informativeText = """
      The server will restart in shared mode, and anyone with the link to this board will be able to edit it. \
      The agent will stay off until you turn it on. The link will be copied to the clipboard.
      """
    alert.addButton(withTitle: "Share")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { [weak self] response in
      guard response == .alertFirstButtonReturn, let self else { return }
      Task { await self.startSharing() }
    }
  }

  private func startSharing() async {
    let path = selectedBoard.map { LabConfig.isLocal($0.url) ? $0.url.path : "" } ?? ""
    let result = await server.startSharing(boardPath: path)
    retargetLocalTabs()
    guard result.ok, let link = publicLinkForCurrentBoard else {
      showError("Could not enable sharing via Cloudflare", result.output)
      return
    }
    Self.copy(link.absoluteString)
    let alert = NSAlert()
    alert.messageText = "Sharing is on, link copied"
    alert.informativeText = link.absoluteString
    alert.beginSheetModal(for: window) { _ in }
  }

  private func stopSharing() {
    Task {
      let result = await server.stopSharing()
      retargetLocalTabs()
      if !result.ok { showError("Could not stop Cloudflare", result.output) }
    }
  }

  func agentPressed() {
    guard server.mode == .shared else { return }
    if server.agentEnabled {
      Task { await setAgent(false) }
      return
    }
    let alert = NSAlert()
    alert.messageText = "Enable the agent in the board chat?"
    alert.informativeText = """
      People with the public link will be able to send requests to the configured agent \
      (\(server.agentModel ?? "the configured model")), which modify the board. You can turn it off with the same button.
      """
    alert.addButton(withTitle: "Enable")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { [weak self] response in
      guard response == .alertFirstButtonReturn, let self else { return }
      Task { await self.setAgent(true) }
    }
  }

  private func setAgent(_ enabled: Bool) async {
    let result = await server.setAgent(enabled: enabled)
    if !result.ok { showError(enabled ? "Could not enable the agent" : "Could not disable the agent", result.output) }
  }

  private func showError(_ title: String, _ output: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = title
    alert.informativeText = String(output.suffix(1200))
    alert.beginSheetModal(for: window) { _ in }
  }

  static func copy(_ text: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
  }
}
