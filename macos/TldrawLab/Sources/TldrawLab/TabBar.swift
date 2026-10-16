import AppKit

/// In-window tab strip. The app deliberately avoids native NSWindow tabbing: every native tab is a
/// separate window, which tiling managers such as AeroSpace re-layout on each tab switch.
@MainActor
final class TabBarView: NSView {
  struct Tab {
    let id: UUID
    let title: String
    let selected: Bool
    let live: Bool
  }

  struct ServerState {
    let shared: Bool
    let publicURL: URL?
    let agentEnabled: Bool
    let agentBusy: Bool
    let agentModel: String?
    let task: String?
    let health: LabServer.Health
    let recoveryGaveUp: Bool
  }

  var onSelect: ((UUID) -> Void)?
  var onClose: ((UUID) -> Void)?
  var onMenu: ((UUID, NSEvent, NSView) -> Void)?
  var onNewTab: (() -> Void)?
  var onCloud: ((NSView) -> Void)?
  /// Right-click menu for the cloud button.
  var cloudMenu: (() -> NSMenu?)? {
    get { cloudButton.menuProvider }
    set { cloudButton.menuProvider = newValue }
  }
  var onAgent: (() -> Void)?

  private let tabsStack = NSStackView()
  private let newTabButton = TabBarView.iconButton("plus", "New tab (⌘T)")
  private let spinner = NSProgressIndicator()
  private let taskLabel = NSTextField(labelWithString: "")
  private let cloudButton = TabBarView.iconButton("cloud", "Share via Cloudflare")
  private let agentButton = TabBarView.iconButton("sparkles", "The agent is available only when shared via Cloudflare")
  private let modelLabel = NSTextField(labelWithString: "")

  override init(frame: NSRect) {
    super.init(frame: frame)
    tabsStack.orientation = .horizontal
    tabsStack.distribution = .fillEqually
    tabsStack.spacing = 4
    tabsStack.setContentHuggingPriority(.defaultLow, for: .horizontal)
    tabsStack.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

    newTabButton.target = self
    newTabButton.action = #selector(newTabPressed)
    cloudButton.target = self
    cloudButton.action = #selector(cloudPressed)
    agentButton.target = self
    agentButton.action = #selector(agentPressed)

    spinner.style = .spinning
    spinner.controlSize = .small
    spinner.isDisplayedWhenStopped = false
    for label in [taskLabel, modelLabel] {
      label.font = .systemFont(ofSize: 11)
      label.textColor = .secondaryLabelColor
      label.lineBreakMode = .byTruncatingTail
      label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    }

    let row = NSStackView(views: [tabsStack, newTabButton, spinner, taskLabel, cloudButton, agentButton, modelLabel])
    row.orientation = .horizontal
    row.spacing = 6
    row.edgeInsets = NSEdgeInsets(top: 0, left: 8, bottom: 0, right: 12)
    row.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)
    NSLayoutConstraint.activate([
      row.leadingAnchor.constraint(equalTo: leadingAnchor),
      row.trailingAnchor.constraint(equalTo: trailingAnchor),
      row.topAnchor.constraint(equalTo: topAnchor, constant: 3),
      row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -5),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  func update(tabs: [Tab]) {
    tabsStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    for tab in tabs {
      let item = TabItemView(tab: tab)
      item.onSelect = { [weak self] in self?.onSelect?(tab.id) }
      item.onClose = { [weak self] in self?.onClose?(tab.id) }
      item.onMenu = { [weak self] event, view in self?.onMenu?(tab.id, event, view) }
      tabsStack.addArrangedSubview(item)
    }
  }

  func update(server: ServerState) {
    if let task = server.task {
      spinner.startAnimation(nil)
      taskLabel.stringValue = task
      taskLabel.isHidden = false
    } else {
      spinner.stopAnimation(nil)
      taskLabel.isHidden = true
    }
    let busy = server.task != nil
    cloudButton.isEnabled = !busy
    cloudButton.image = Self.symbol(server.shared ? "cloud.fill" : "cloud")
    if server.shared {
      let host = server.publicURL?.host ?? "…"
      switch server.health {
      case .ok:
        cloudButton.contentTintColor = .systemGreen
        cloudButton.toolTip = "Cloudflare sharing is on: \(host)"
      case .unknown, .degraded:
        cloudButton.contentTintColor = .systemYellow
        cloudButton.toolTip = "Checking access…"
      case .down:
        cloudButton.contentTintColor = .systemRed
        cloudButton.toolTip = server.recoveryGaveUp
          ? "Cloudflare is unavailable and could not be restored"
          : "Cloudflare is not responding, restoring…"
      }
    } else {
      cloudButton.contentTintColor = nil
      cloudButton.toolTip = "Share the board via Cloudflare"
    }

    agentButton.isEnabled = server.shared && !busy
    agentButton.contentTintColor = server.agentEnabled ? .systemPurple : nil
    let model = server.agentModel.map { " · \($0)" } ?? ""
    agentButton.toolTip = !server.shared
      ? "The agent is available only when shared via Cloudflare"
      : server.agentEnabled
        ? "Agent enabled\(model)\(server.agentBusy ? " · working" : ""). Click to turn off"
        : "Enable the agent in the board chat\(model)"
    modelLabel.stringValue = server.agentEnabled ? (server.agentBusy ? "working…" : server.agentModel ?? "") : ""
    modelLabel.isHidden = modelLabel.stringValue.isEmpty
  }

  @objc private func newTabPressed() { onNewTab?() }
  @objc private func cloudPressed() { onCloud?(cloudButton) }
  @objc private func agentPressed() { onAgent?() }

  private static func symbol(_ name: String) -> NSImage? {
    NSImage(systemSymbolName: name, accessibilityDescription: nil)?
      .withSymbolConfiguration(.init(pointSize: 13, weight: .medium))
  }

  private static func iconButton(_ symbol: String, _ tooltip: String) -> MenuButton {
    let button = MenuButton(image: Self.symbol(symbol) ?? NSImage(), target: nil, action: nil)
    button.bezelStyle = .accessoryBarAction
    button.isBordered = false
    button.toolTip = tooltip
    button.setContentHuggingPriority(.required, for: .horizontal)
    button.widthAnchor.constraint(equalToConstant: 26).isActive = true
    return button
  }
}

/// Button with a context menu built on demand, so it always reflects the current state.
@MainActor
private final class MenuButton: NSButton {
  var menuProvider: (() -> NSMenu?)?

  override func menu(for event: NSEvent) -> NSMenu? { menuProvider?() }
}

@MainActor
private final class TabItemView: NSView {
  var onSelect: (() -> Void)?
  var onClose: (() -> Void)?
  var onMenu: ((NSEvent, NSView) -> Void)?

  private let tab: TabBarView.Tab
  private let label = NSTextField(labelWithString: "")
  private let closeButton = NSButton()
  private var hovered = false { didSet { refresh() } }

  init(tab: TabBarView.Tab) {
    self.tab = tab
    super.init(frame: .zero)
    wantsLayer = true
    layer?.cornerRadius = 7
    toolTip = tab.live ? tab.title : "\(tab.title) — unloaded from memory"

    label.stringValue = tab.title
    label.font = .systemFont(ofSize: 12, weight: tab.selected ? .medium : .regular)
    label.lineBreakMode = .byTruncatingTail
    label.alignment = .center
    label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    label.translatesAutoresizingMaskIntoConstraints = false

    closeButton.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close tab")?
      .withSymbolConfiguration(.init(pointSize: 9, weight: .semibold))
    closeButton.isBordered = false
    closeButton.target = self
    closeButton.action = #selector(closePressed)
    closeButton.translatesAutoresizingMaskIntoConstraints = false

    addSubview(label)
    addSubview(closeButton)
    NSLayoutConstraint.activate([
      heightAnchor.constraint(equalToConstant: 26),
      widthAnchor.constraint(greaterThanOrEqualToConstant: 60),
      closeButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
      closeButton.centerYAnchor.constraint(equalTo: centerYAnchor),
      closeButton.widthAnchor.constraint(equalToConstant: 16),
      label.leadingAnchor.constraint(equalTo: closeButton.trailingAnchor, constant: 2),
      label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -22),
      label.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])
    addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect], owner: self))
    refresh()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  private func refresh() {
    let fill: NSColor = tab.selected
      ? .labelColor.withAlphaComponent(0.1)
      : hovered ? .labelColor.withAlphaComponent(0.05) : .clear
    effectiveAppearance.performAsCurrentDrawingAppearance {
      layer?.backgroundColor = fill.cgColor
    }
    label.textColor = tab.selected ? .labelColor : .secondaryLabelColor
    label.alphaValue = tab.live || tab.selected ? 1 : 0.6
    closeButton.isHidden = !(hovered || tab.selected)
  }

  override func updateLayer() { refresh() }
  override func mouseEntered(with event: NSEvent) { hovered = true }
  override func mouseExited(with event: NSEvent) { hovered = false }
  override func mouseDown(with event: NSEvent) { onSelect?() }
  override func otherMouseDown(with event: NSEvent) { if event.buttonNumber == 2 { onClose?() } }
  override func rightMouseDown(with event: NSEvent) { onMenu?(event, self) }
  @objc private func closePressed() { onClose?() }
}
