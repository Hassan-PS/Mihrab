#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(MihrabKeyCommands, RCTEventEmitter)

// Claim or release the arrow keys — see KeyCommands.swift.
RCT_EXTERN_METHOD(setArrowPriority : (nonnull NSNumber *)on)

@end
