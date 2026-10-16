// swift-tools-version:5.10
import PackageDescription

let package = Package(
  name: "TldrawLab",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(name: "TldrawLab", path: "Sources/TldrawLab")
  ]
)
