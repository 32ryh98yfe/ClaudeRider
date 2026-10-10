// macOS: source-aligned three-panel comparison, using actual game-rendered PNGs and measured speed curves.
// swift tools/reference/compose.swift <source.mp4> <captures-root> <baseline-report.json> <candidate-report.json> <output.mp4>
import Foundation
import AppKit
import AVFoundation
import CoreVideo

let args = CommandLine.arguments
guard args.count == 6 else { fatalError("Usage: compose.swift source.mp4 captures-root baseline.json candidate.json output.mp4") }
let source = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let generator = AVAssetImageGenerator(asset: source)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let baseline = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[3]))) as! [String: Any]
let candidate = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[4]))) as! [String: Any]
let beforeClips = baseline["clips"] as! [[String: Any]]
let afterClips = candidate["clips"] as! [[String: Any]]
let ids = ["expert-launch", "expert-right", "intermediate-launch", "beginner-launch"]
let output = URL(fileURLWithPath: args[5])
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
if FileManager.default.fileExists(atPath: output.path) { try FileManager.default.removeItem(at: output) }
let width = 1920, height = 840
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height, AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 7_000_000]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height, kCVPixelBufferCGImageCompatibilityKey as String: true, kCVPixelBufferCGBitmapContextCompatibilityKey as String: true])
writer.add(input)
guard writer.startWriting() else { fatalError(String(describing: writer.error)) }
writer.startSession(atSourceTime: .zero)
let colorSpace = CGColorSpaceCreateDeviceRGB()
let white = NSColor(calibratedWhite: 0.94, alpha: 1)
let muted = NSColor(calibratedRed: 0.58, green: 0.64, blue: 0.72, alpha: 1)
let amber = NSColor(calibratedRed: 1, green: 0.67, blue: 0.25, alpha: 1)
let cyan = NSColor(calibratedRed: 0.27, green: 0.84, blue: 0.89, alpha: 1)
func text(_ value: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat = 22, _ color: NSColor = NSColor.white) {
    (value as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: .medium), .foregroundColor: color])
}
func image(_ file: URL) throws -> CGImage {
    guard let image = NSImage(contentsOf: file), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw NSError(domain: "Missing capture: \(file.path)", code: 1) }
    return cg
}
func curve(_ ctx: CGContext, _ points: [(Double, Double)], _ rect: CGRect, _ duration: Double, _ color: NSColor, _ thick: CGFloat) {
    guard !points.isEmpty else { return }
    ctx.setStrokeColor(color.cgColor); ctx.setLineWidth(thick)
    for (i, point) in points.enumerated() {
        let p = CGPoint(x: rect.minX + point.0 / duration * rect.width, y: rect.minY + min(350, max(0, point.1)) / 350 * rect.height)
        if i == 0 { ctx.move(to: p) } else { ctx.addLine(to: p) }
    }
    ctx.strokePath()
}
var outputFrame = 0
for id in ids {
    let a = beforeClips.first { $0["id"] as? String == id }!
    let b = afterClips.first { $0["id"] as? String == id }!
    let start = b["sourceStartFrame"] as! Int, end = b["sourceEndFrame"] as! Int
    let count = end - start, duration = Double(count) / 30
    let observations = (b["comparisons"] as! [[String: Any]]).map { (Double($0["frame"] as! Int) / 30, $0["source"] as! Double) }
    let before = (a["samples"] as! [[String: Any]]).map { ($0["seconds"] as! Double, $0["speedKmh"] as! Double) }
    let after = (b["samples"] as! [[String: Any]]).map { ($0["seconds"] as! Double, $0["speedKmh"] as! Double) }
    let keys = b["inputTransitions"] as! [[String: Any]]
    let eligible = b["quantitativeEligible"] as! Bool
    for frame in 0..<count {
        try autoreleasepool {
            var buffer: CVPixelBuffer?
            let status = CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
            guard status == kCVReturnSuccess, let pixel = buffer else { fatalError("Pixel buffer allocation failed") }
            CVPixelBufferLockBaseAddress(pixel, [])
            defer { CVPixelBufferUnlockBaseAddress(pixel, []) }
            let context = CGContext(data: CVPixelBufferGetBaseAddress(pixel), width: width, height: height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixel), space: colorSpace, bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue)!
            context.setFillColor(NSColor(calibratedRed: 0.035, green: 0.055, blue: 0.08, alpha: 1).cgColor)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
            text("REFERENCE FOOTAGE", 22, 796, 25, white)
            text("BEFORE  /  5db2299", 662, 796, 25, amber)
            text("AFTER  /  v10 controlled grip", 1302, 796, 25, cyan)
            text(id + (eligible ? "  |  launch comparison" : "  |  unknown initial slip: diagnostic only"), 22, 762, 18, muted)
            text(String(format: "source %.3fs  |  frame %d", Double(start + frame) / 30, start + frame), 1302, 764, 18, muted)
            let sourceImage = try generator.copyCGImage(at: CMTime(value: Int64(start + frame), timescale: 30), actualTime: nil)
            let game = sourceImage.cropping(to: CGRect(x: 0, y: 0, width: 1440, height: 1080))!
            let filename = String(format: "frame-%05d.png", frame)
            let old = try image(URL(fileURLWithPath: args[2]).appendingPathComponent("baseline/\(id)/\(filename)"))
            let new = try image(URL(fileURLWithPath: args[2]).appendingPathComponent("candidate/\(id)/\(filename)"))
            for (i, cg) in [game, old, new].enumerated() { context.draw(cg, in: CGRect(x: i * 640, y: 270, width: 640, height: 480)) }
            text("HUD SPEED  /  km/h", 22, 230, 19, muted)
            let chart = CGRect(x: 85, y: 50, width: 1750, height: 165)
            for speed in [0, 100, 200, 300] {
                let y = chart.minY + Double(speed) / 350 * chart.height
                context.setStrokeColor(NSColor(calibratedWhite: 0.22, alpha: 1).cgColor); context.setLineWidth(1)
                context.move(to: CGPoint(x: chart.minX, y: y)); context.addLine(to: CGPoint(x: chart.maxX, y: y)); context.strokePath()
                text(String(speed), 28, y - 8, 15, muted)
            }
            curve(context, observations, chart, duration, white, 3)
            curve(context, before, chart, duration, amber, 3)
            curve(context, after, chart, duration, cyan, 3)
            let time = Double(frame) / 30
            let x = chart.minX + time / duration * chart.width
            context.setStrokeColor(white.cgColor); context.setLineWidth(1)
            context.move(to: CGPoint(x: x, y: chart.minY)); context.addLine(to: CGPoint(x: x, y: chart.maxY)); context.strokePath()
            let held = keys.last { ($0["frame"] as! Int) <= frame }?["keys"] as? [String] ?? []
            text("RAW KEYS: " + (held.isEmpty ? "released" : held.joined(separator: " + ")), 320, 230, 19, white)
            text(String(format: "t = %.2f s", time), 1660, 230, 20, white)
            text("Deterministic game rendering  |  30 fps  |  same raw keys / starting state  |  v10 intentionally slower  |  no retiming", 85, 14, 17, muted)
            NSGraphicsContext.restoreGraphicsState()
            if outputFrame == 0, let cg = context.makeImage() {
                let rep = NSBitmapImageRep(cgImage: cg)
                try rep.representation(using: .png, properties: [:])!.write(to: output.deletingPathExtension().appendingPathExtension("png"))
            }
            while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
            guard adaptor.append(pixel, withPresentationTime: CMTime(value: Int64(outputFrame), timescale: 30)) else { fatalError(String(describing: writer.error)) }
            outputFrame += 1
        }
    }
    print("composed \(id): \(count) frames")
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else { fatalError(String(describing: writer.error)) }
print("saved \(output.path): \(outputFrame) frames / \(Double(outputFrame) / 30)s")
