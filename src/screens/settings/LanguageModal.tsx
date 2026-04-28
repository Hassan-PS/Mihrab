import React, { memo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import type { AppLanguage } from '../../settings/types';
import { modalStyles } from './modalStyles';

const LANGUAGES: { id: AppLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'sv', label: 'Svenska' },
  { id: 'ar', label: 'العربية' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'ur', label: 'اردو' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'de', label: 'Deutsch' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'ru', label: 'Русский' },
  { id: 'zh', label: '中文' },
];

type Props = {
  visible: boolean;
  current: AppLanguage;
  palette: AppPalette;
  onSelect: (lang: AppLanguage) => void;
  onClose: () => void;
};

export const LanguageModal = memo(function LanguageModal({
  visible,
  current,
  palette,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <Pressable
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.language')}
          </Text>
          <FlatList
            data={LANGUAGES}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  current === item.id && { backgroundColor: palette.bg },
                ]}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}>
                <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
});
