/* eslint-env jest */

// react-native-gesture-handler uses TurboModuleRegistry.getEnforcing at import
// time, which throws in Jest because native modules aren't registered.  Mock the
// entire package before any module loads so the native call never executes.
jest.mock('react-native-gesture-handler', () => {
  const { View, TouchableOpacity, FlatList, Switch, TextInput } =
    require('react-native');
  const noop = jest.fn();
  const makeGesture = () => {
    const g = {};
    const methods = [
      'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize',
      'onFail', 'onCancel', 'onTouchesDown', 'onTouchesMove', 'onTouchesUp',
      'minDistance', 'maxDuration', 'numberOfTaps', 'direction',
      'simultaneousWithExternalGesture', 'requireExternalGestureToFail',
      'blocksExternalGesture', 'withRef', 'enabled', 'shouldCancelWhenOutside',
      'hitSlop', 'activeCursor', 'mouseButton', 'runOnJS', 'config',
    ];
    methods.forEach(m => { g[m] = jest.fn(() => g); });
    return g;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }) => children,
    Gesture: {
      Pan: makeGesture, Tap: makeGesture, Fling: makeGesture,
      LongPress: makeGesture, Pinch: makeGesture, Rotation: makeGesture,
      ForceTouch: makeGesture, Native: makeGesture,
      Simultaneous: (...h) => h, Race: (...h) => h, Exclusive: (...h) => h,
    },
    State: { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 },
    Directions: { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 },
    gestureHandlerRootHOC: c => c,
    PanGestureHandler: View, TapGestureHandler: View,
    PinchGestureHandler: View, RotationGestureHandler: View,
    FlingGestureHandler: View, LongPressGestureHandler: View,
    ForceTouchGestureHandler: View, NativeViewGestureHandler: View,
    RawButton: View, BaseButton: View, RectButton: View, BorderlessButton: View,
    Swipeable: View, DrawerLayout: View,
    ScrollView: View, FlatList, Switch, TextInput,
    TouchableHighlight: TouchableOpacity,
    TouchableNativeFeedback: TouchableOpacity,
    TouchableOpacity: TouchableOpacity,
    TouchableWithoutFeedback: View,
    useAnimatedGestureHandler: jest.fn(() => ({})),
    createNativeWrapper: c => c,
    enableExperimentalWebImplementation: noop,
    enableLegacyWebImplementation: noop,
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(success =>
      success({ coords: { latitude: 51.5, longitude: -0.12 } }),
    ),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('adhan', () => {
  const t = new Date(2026, 3, 9, 5, 0, 0);
  const mk = () => ({ madhab: 'shafi' });
  const names = [
    'Tehran',
    'Karachi',
    'NorthAmerica',
    'MuslimWorldLeague',
    'UmmAlQura',
    'Egyptian',
    'Dubai',
    'Kuwait',
    'Qatar',
    'Singapore',
    'Turkey',
    'MoonsightingCommittee',
  ];
  const CM = {};
  names.forEach(n => {
    CM[n] = mk;
  });
  return {
    Coordinates: function Coordinates() {},
    Madhab: { Hanafi: 'hanafi', Shafi: 'shafi' },
    CalculationMethod: CM,
    PrayerTimes: function PrayerTimes() {
      this.fajr = t;
      this.sunrise = t;
      this.dhuhr = t;
      this.asr = t;
      this.maghrib = t;
      this.isha = t;
    },
  };
});

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    open: jest.fn(() => Promise.resolve({ success: true })),
    shareSingle: jest.fn(() => Promise.resolve({ success: true })),
    isPackageInstalled: jest.fn(() => Promise.resolve({ isInstalled: false })),
  },
  Social: {},
}));

jest.mock('react-native-view-shot', () => ({
  __esModule: true,
  default: 'ViewShot',
  captureRef: jest.fn(() => Promise.resolve('file://mock.png')),
  captureScreen: jest.fn(() => Promise.resolve('file://mock.png')),
}));

jest.mock('react-native-sensors', () => ({
  magnetometer: {
    subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
  },
  setUpdateIntervalForType: jest.fn(),
  SensorTypes: { magnetometer: 'magnetometer' },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    cancelTriggerNotifications: jest.fn(() => Promise.resolve()),
    createChannel: jest.fn(() => Promise.resolve()),
    createTriggerNotification: jest.fn(() => Promise.resolve()),
    getNotificationSettings: jest.fn(() =>
      Promise.resolve({
        android: { alarm: 1 },
      }),
    ),
    openAlarmPermissionSettings: jest.fn(() => Promise.resolve()),
  },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidNotificationSetting: { DISABLED: 0, ENABLED: 1, NOT_SUPPORTED: -1 },
  AlarmType: {
    SET_EXACT_AND_ALLOW_WHILE_IDLE: 3,
  },
}));
