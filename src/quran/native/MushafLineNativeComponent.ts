/**
 * The codegen spec for the native line view — see `MushafLineView.ts`,
 * which is the file to read. This one is rewritten at bundle time by
 * `@react-native/babel-plugin-codegen` (any `*NativeComponent.ts` whose
 * default export is `codegenNativeComponent`) into a static view config,
 * which is what a component needs on the new architecture; the native
 * side is an ordinary view manager on both platforms, carried by the
 * interop layer. Keep it to the types and the export: everything else in
 * the file is discarded.
 *
 * Colours inside `runs` travel as `processColor` numbers, since a view
 * config processes only its top-level props.
 */
import {
  codegenNativeComponent,
  type CodegenTypes,
  type ColorValue,
  type HostComponent,
  type ViewProps,
} from 'react-native';

type Double = CodegenTypes.Double;

export type NativeRun = Readonly<{
  t?: string;
  g?: Double;
  w?: Double;
  i?: Double;
}>;

export interface NativeProps extends ViewProps {
  fontFamily: string;
  fontSize: Double;
  color?: ColorValue;
  runs: ReadonlyArray<NativeRun>;
  /**
   * Named so as not to collide with a layout prop: `right`, `top` and
   * their kind are Yoga's on any host component, and a `right` of 340
   * moved the whole view 340dp to the left.
   */
  penRight: Double;
  penBaseline: Double;
  boxTop: Double;
  boxHeight: Double;
}

export default codegenNativeComponent<NativeProps>('MushafLine') as HostComponent<NativeProps>;
