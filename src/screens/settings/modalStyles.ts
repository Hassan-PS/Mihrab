/** Shared stylesheet for the bottom-sheet modals inside SettingsScreen. */
import { StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

export const modalStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: '72%',
    borderTopStartRadius: 16,
    borderTopEndRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACING.md,
  },
  title: {
    fontSize: TYPE.title3.fontSize,
    fontWeight: '700',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  row: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: TYPE.body.fontSize,
  },
  rowSub: {
    fontSize: TYPE.footnote.fontSize,
    marginTop: SPACING.xs,
    lineHeight: 18,
  },
  soundRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soundRowText: {
    flex: 1,
  },
  soundPreviewBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: SPACING.sm,
  },
  soundPreviewIcon: {
    fontSize: TYPE.callout.fontSize,
    lineHeight: 18,
  },
});
