import Foundation
import CoreLocation
import React

@objc(CompassModule)
class CompassModule: RCTEventEmitter, CLLocationManagerDelegate {
  private var locationManager: CLLocationManager?
  private var hasListeners = false
  
  override init() {
    super.init()
    locationManager = CLLocationManager()
    locationManager?.delegate = self
  }
  
  override func supportedEvents() -> [String]! {
    return ["CompassHeading"]
  }
  
  override func startObserving() {
    hasListeners = true
  }
  
  override func stopObserving() {
    hasListeners = false
  }
  
  @objc
  func startUpdates() {
    DispatchQueue.main.async {
      if CLLocationManager.headingAvailable() {
        self.locationManager?.headingFilter = 1
        self.locationManager?.startUpdatingHeading()
      }
    }
  }
  
  @objc
  func stopUpdates() {
    DispatchQueue.main.async {
      self.locationManager?.stopUpdatingHeading()
    }
  }
  
  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    if hasListeners {
      // Use trueHeading if valid, otherwise magneticHeading
      let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
      let accuracy = newHeading.headingAccuracy
      sendEvent(withName: "CompassHeading", body: [
        "heading": heading,
        "accuracy": accuracy
      ])
    }
  }
  
  override class func requiresMainQueueSetup() -> Bool {
    return true
  }
}
