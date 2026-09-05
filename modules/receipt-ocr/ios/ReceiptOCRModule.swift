import ExpoModulesCore
import Vision
import UIKit

public class ReceiptOCRModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOCR")

    AsyncFunction("recognizeText") { (uri: String) -> [String] in
      let path: String
      if let url = URL(string: uri), url.isFileURL {
        path = url.path
      } else {
        path = uri
      }

      guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else {
        return []
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.recognitionLanguages = ["en-US", "ro-RO"]

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      try handler.perform([request])

      return (request.results ?? []).compactMap { observation in
        observation.topCandidates(1).first?.string
      }
    }
  }
}
