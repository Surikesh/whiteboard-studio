// Renders AppIcon.iconset PNGs from the official tldraw mark (AppIcon.svg, from tldraw.com):
// swift make-icon.swift <AppIcon.svg> <iconset-dir>
// The mark is inverted (white ";" on black) and drawn full-bleed: macOS 26+ masks full-bleed
// icons itself and puts inset icons with their own margin into a grey squircle.
import AppKit

let source = URL(fileURLWithPath: CommandLine.arguments[1])
let out = URL(fileURLWithPath: CommandLine.arguments[2])
guard let svg = try? String(contentsOf: source, encoding: .utf8) else { fatalError("Cannot read \(source.path)") }
let inverted = svg
  .replacingOccurrences(of: "fill=\"white\"", with: "fill=\"__BG__\"")
  .replacingOccurrences(of: "fill=\"black\"", with: "fill=\"white\"")
  .replacingOccurrences(of: "fill=\"__BG__\"", with: "fill=\"black\"")
guard let mark = NSImage(data: Data(inverted.utf8)) else { fatalError("Cannot render \(source.path)") }
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func render(_ size: Int) -> Data {
  let s = CGFloat(size)
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  NSColor.black.setFill()
  NSRect(x: 0, y: 0, width: s, height: s).fill()
  mark.draw(in: NSRect(x: 0, y: 0, width: s, height: s), from: .zero, operation: .sourceOver, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

for base in [16, 32, 128, 256, 512] {
  try render(base).write(to: out.appendingPathComponent("icon_\(base)x\(base).png"))
  try render(base * 2).write(to: out.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
