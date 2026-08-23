import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '../../components/ConfirmModal';

/**
 * The app's own dialog, everywhere sync would otherwise call `Alert.alert`.
 *
 * `Alert` draws the platform's stock dialog — on Android a Material box
 * with its own corner radius, its own type and its own blue, sitting in the
 * middle of a screen that has none of those. Every other confirmation in
 * this app already goes through `ConfirmModal`; sync was the exception
 * because it was written quickly, and it showed.
 *
 * One dialog at a time, on purpose. Sync has flows that ask and then report
 * — pair, confirm, then say what happened — and a queue would let the
 * second appear over the first. `onConfirm` runs after the sheet closes, so
 * a handler that opens another dialog does the right thing without knowing
 * anything about this.
 */
export type SyncAsk = {
  title: string;
  message?: string;
  /** Present makes it a question; absent makes it a statement with one button. */
  onConfirm?: () => void;
  confirmLabel?: string;
  destructive?: boolean;
};

export function useSyncDialog() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<SyncAsk | null>(null);

  /** Ask something, or — with no `onConfirm` — simply say it. */
  const ask = useCallback((next: SyncAsk) => setCurrent(next), []);

  /** Report. The shorthand for the case with nothing to decide. */
  const tell = useCallback(
    (title: string, message?: string) => setCurrent({ title, message }),
    [],
  );

  const close = useCallback(() => setCurrent(null), []);

  const dialog = (
    <ConfirmModal
      visible={current !== null}
      title={current?.title ?? ''}
      message={current?.message}
      confirmLabel={current?.confirmLabel ?? t('common.ok')}
      cancelLabel={t('common.cancel')}
      destructive={current?.destructive}
      // Nothing to cancel when the dialog is telling rather than asking.
      hideCancel={!current?.onConfirm}
      onCancel={close}
      onConfirm={() => {
        const run = current?.onConfirm;
        close();
        run?.();
      }}
    />
  );

  return { ask, tell, dialog };
}
