/**
 * The Quran tab's header, trailing edge.
 *
 * Two things share it: the way into Tilāwah, which is always there, and
 * the sync button, which appears only once sync is set up (see
 * SyncHeaderButton — it renders nothing until then). One component
 * because `headerRight` takes one, and because the two have to lay out
 * against each other rather than each guessing at the other's width.
 */
import { StyleSheet, View } from 'react-native';
import { SyncHeaderButton } from '../sync/SyncHeaderButton';
import { TilawahHeaderChip } from './TilawahHeaderChip';

export function QuranHeaderRight() {
  return (
    <View style={styles.row}>
      <TilawahHeaderChip />
      <SyncHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
