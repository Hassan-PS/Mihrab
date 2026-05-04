/** Shared stylesheet for the bottom-sheet modals inside SettingsScreen. */
import { StyleSheet } from 'react-native';

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
    paddingTop: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowSub: {
    fontSize: 13,
    marginTop: 4,
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
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },
  soundPreviewIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
});
