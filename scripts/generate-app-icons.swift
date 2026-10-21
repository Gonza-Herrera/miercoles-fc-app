// Resize the approved logo without changing its artwork.
// Run from the project root: swift scripts/generate-app-icons.swift
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = root.appendingPathComponent("public/brand/miercoles-fc-logo.png")
guard let image = NSImage(contentsOf: source),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fatalError("No se pudo abrir el logo")
}
let output = root.appendingPathComponent("public/icons")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let variants: [(String, Int, Bool)] = [
    ("icon-192.png", 192, false), ("icon-512.png", 512, false),
    ("icon-maskable-192.png", 192, true), ("icon-maskable-512.png", 512, true),
    ("apple-touch-icon-180.png", 180, true), ("apple-touch-icon-167.png", 167, true),
    ("apple-touch-icon-152.png", 152, true),
    ("favicon-32.png", 32, false), ("favicon-16.png", 16, false)
]
for (name, size, opaque) in variants {
    guard let context = CGContext(data: nil, width: size, height: size,
        bitsPerComponent: 8, bytesPerRow: size * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        fatalError("No se pudo crear el contexto")
    }
    let rect = CGRect(x: 0, y: 0, width: size, height: size)
    if opaque {
        context.setFillColor(CGColor(red: 79.0/255, green: 70.0/255, blue: 229.0/255, alpha: 1))
        context.fill(rect)
    }
    context.interpolationQuality = .high
    context.draw(cgImage, in: rect)
    guard let rendered = context.makeImage(),
          let png = NSBitmapImageRep(cgImage: rendered).representation(using: .png, properties: [:]) else {
        fatalError("No se pudo exportar PNG")
    }
    try png.write(to: output.appendingPathComponent(name))
    print("\(name): \(size)x\(size)")
}
