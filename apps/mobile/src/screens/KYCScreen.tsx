import React, { useState } from 'react';
import { SettingsModal } from '../components/SettingsModal';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { BlurModal } from '../components/BlurModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { Button } from '../components/Button';
import { api } from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/auth.store';
import { IconX, IconUpload } from '../components/Icons';
import { GameTopBar } from './HomeScreen';

type Props = { navigation: NativeStackNavigationProp<any> };

type DocType = 'RG' | 'CNH' | 'PASSPORT';

const DOC_LABELS: Record<DocType, string> = {
  RG: 'RG',
  CNH: 'CNH (Habilitação)',
  PASSPORT: 'Passaporte',
};

const STEPS = ['Tipo de Documento', 'Frente & Verso', 'Selfie', 'Enviando'];

// Cores do tema KYC conforme especificação
const KYC_COLORS = {
  modalBackground: '#082006',
  modalBorder: '#0F400B',
  progressCompleted: '#1F5D18',
  progressNotCompleted: '#0E290F',
  buttonChoice: '#0E290F',
  buttonChoiceBorder: '#1F5D18',
  buttonSelected: '#1F5D18',
  buttonNext: '#0F400B',
};

export function KYCScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [step, setStep] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [docType, setDocType] = useState<DocType | null>(null);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [choiceModal, setChoiceModal] = useState<{ visible: boolean; type: 'front' | 'back' | null }>({ visible: false, type: null });

  const pickImage = async (camera = false) => {
    const { status } = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso às suas fotos ou câmera.');
      return null;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.6,
          allowsEditing: true,
          aspect: [4, 3],
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.6,
          allowsEditing: true,
          aspect: [4, 3],
        });
    if (result.canceled) return null;
    return result.assets[0].uri;
  };

  const handleSubmit = async () => {
    if (!docType || !frontUri || !selfieUri) return;
    setLoading(true);
    setStep(3);
    try {
      const form = new FormData();
      form.append('document_type', docType);

      // Append files with proper React Native FormData format
      form.append('front', {
        uri: frontUri,
        type: 'image/jpeg',
        name: 'front.jpg',
      } as any);

      if (backUri) {
        form.append('back', {
          uri: backUri,
          type: 'image/jpeg',
          name: 'back.jpg',
        } as any);
      }

      form.append('selfie', {
        uri: selfieUri,
        type: 'image/jpeg',
        name: 'selfie.jpg',
      } as any);

      console.log('Uploading KYC documents:', { docType, frontUri, backUri, selfieUri });

      const response = await api.post('/kyc/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // 60 segundos para upload de arquivos
      });

      console.log('Upload success:', response.data);

      Alert.alert(
        'Documentos enviados!',
        'Sua verificação de identidade será analisada em até 48 horas. Você receberá uma notificação quando for aprovada.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      console.error('Upload error:', err.response?.data || err.message);
      setError(err.response?.data?.error || err.response?.data?.message || 'Erro ao enviar documentos. Tente novamente.');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>
        {/* Top Navigation Bar - Same as HomeScreen */}
        <GameTopBar
          user={user}
          onWallet={() => navigation.navigate('Wallet')}
          onSettings={() => setSettingsVisible(true)}
          onExit={() => navigation.goBack()}
          onProfile={() => navigation.navigate('Main', { openModal: 'profile' })}
          exitVariant="back"
        />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Verificação de Identidade</Text>
          <Text style={styles.subtitle}>Para liberar saques, precisamos confirmar sua identidade.</Text>

          {/* Step indicator - Estilo da imagem */}
          <View style={styles.stepRow}>
            {/* Background line */}
            <View style={styles.stepBackgroundLine}>
              <View style={[
                styles.stepBackgroundLineFill,
                { width: step >= 1 ? '50%' : '0%' },
                step >= 2 && { width: '100%' }
              ]} />
            </View>

            {/* Step items */}
            <View style={styles.stepItemsContainer}>
              {[1, 2, 3].map((num, i) => (
                <View key={i} style={styles.stepItem}>
                  <View style={[
                    styles.stepDot,
                    i <= step && { backgroundColor: KYC_COLORS.progressCompleted }
                  ]}>
                    <Text style={[
                      styles.stepNum,
                      i <= step && { color: '#fff', fontWeight: '800' }
                    ]}>{num}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            {/* Step 0: Choose document type */}
            {step === 0 && (
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Escolha o documento que você vai usar</Text>
                {(['PASSPORT', 'CNH', 'RG'] as DocType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.docOption,
                      docType === type && styles.docOptionSelected
                    ]}
                    onPress={() => setDocType(type)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.docOptionText,
                      docType === type && styles.docOptionTextSelected
                    ]}>
                      {DOC_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.nextButton,
                    !docType && styles.nextButtonDisabled
                  ]}
                  onPress={() => { if (docType) setStep(1); }}
                  disabled={!docType}
                  activeOpacity={0.8}
                >
                  <Text style={styles.nextButtonText}>Próximo</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 1: Document photos - Novo layout */}
            {step === 1 && (
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Tire ou anexe uma foto do documento</Text>

                {/* Frente Section */}
                <View style={styles.photoSectionNew}>
                  <Text style={styles.photoSectionLabel}>Frente</Text>
                  {frontUri ? (
                    <View style={styles.photoPreviewContainerNew}>
                      <TouchableOpacity
                        style={styles.photoPreviewTouchable}
                        onPress={() => setPreviewUri(frontUri)}
                        activeOpacity={0.9}
                      >
                        <Image source={{ uri: frontUri }} style={styles.photoPreviewImageNew} />
                        <TouchableOpacity
                          style={styles.removePhotoBtnNew}
                          onPress={() => setFrontUri(null)}
                          activeOpacity={0.8}
                        >
                          <IconX size={14} color="#fff" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.photoUploadArea}
                      onPress={() => setChoiceModal({ visible: true, type: 'front' })}
                      activeOpacity={0.8}
                    >
                      <View style={styles.photoUploadPlaceholder} />
                    </TouchableOpacity>
                  )}
                  <View style={styles.photoActionButtons}>
                    <TouchableOpacity
                      style={styles.photoActionBtn}
                      onPress={async () => { const uri = await pickImage(true); if (uri) setFrontUri(uri); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.photoActionBtnText}>Tirar foto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoActionBtn}
                      onPress={async () => { const uri = await pickImage(); if (uri) setFrontUri(uri); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.photoActionBtnText}>Abrir galeria</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Verso Section */}
                <View style={styles.photoSectionNew}>
                  <Text style={styles.photoSectionLabel}>Verso</Text>
                  {backUri ? (
                    <View style={styles.photoPreviewContainerNew}>
                      <TouchableOpacity
                        style={styles.photoPreviewTouchable}
                        onPress={() => setPreviewUri(backUri)}
                        activeOpacity={0.9}
                      >
                        <Image source={{ uri: backUri }} style={styles.photoPreviewImageNew} />
                        <TouchableOpacity
                          style={styles.removePhotoBtnNew}
                          onPress={() => setBackUri(null)}
                          activeOpacity={0.8}
                        >
                          <IconX size={14} color="#fff" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.photoUploadArea}
                      onPress={() => setChoiceModal({ visible: true, type: 'back' })}
                      activeOpacity={0.8}
                    >
                      <View style={styles.photoUploadPlaceholder} />
                    </TouchableOpacity>
                  )}
                  <View style={styles.photoActionButtons}>
                    <TouchableOpacity
                      style={styles.photoActionBtn}
                      onPress={async () => { const uri = await pickImage(true); if (uri) setBackUri(uri); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.photoActionBtnText}>Tirar foto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoActionBtn}
                      onPress={async () => { const uri = await pickImage(); if (uri) setBackUri(uri); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.photoActionBtnText}>Abrir galeria</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.backButtonHalf}
                    onPress={() => setStep(0)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.backButtonText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.nextButtonHalf,
                      (!frontUri || !backUri) && styles.nextButtonDisabled
                    ]}
                    onPress={() => { if (frontUri && backUri) setStep(2); }}
                    disabled={!frontUri || !backUri}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextButtonText}>Próximo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 2: Selfie - Novo layout */}
            {step === 2 && (
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Tire uma selfie</Text>
                <Text style={styles.hint}>Rosto visível, boa luz, sem óculos escuros.</Text>

                <View style={styles.selfieSectionNew}>
                  {selfieUri ? (
                    <View style={styles.selfiePreviewContainerNew}>
                      <TouchableOpacity
                        style={styles.selfiePreviewTouchable}
                        onPress={() => setPreviewUri(selfieUri)}
                        activeOpacity={0.9}
                      >
                        <Image source={{ uri: selfieUri }} style={styles.selfiePreviewImageNew} />
                        <TouchableOpacity
                          style={styles.removePhotoBtnNew}
                          onPress={() => setSelfieUri(null)}
                          activeOpacity={0.8}
                        >
                          <IconX size={14} color="#fff" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.selfieUploadArea}
                      onPress={async () => { const uri = await pickImage(true); if (uri) setSelfieUri(uri); }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.selfieUploadPlaceholder}>
                        <Text style={styles.selfieCameraIconNew}>📷</Text>
                        <Text style={styles.selfieCameraTitleNew}>Tirar Selfie</Text>
                        <Text style={styles.selfieCameraSubtitleNew}>Use a câmera ao vivo</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.backButtonHalf}
                    onPress={() => setStep(1)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.backButtonText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.nextButtonHalf,
                      !selfieUri && styles.nextButtonDisabled
                    ]}
                    onPress={handleSubmit}
                    disabled={!selfieUri || loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.nextButtonText}>Enviar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 3: Uploading */}
            {step === 3 && (
              <View style={[styles.cardInner, styles.centerBox]}>
                <ActivityIndicator size="large" color="#1CBB3D" />
                <Text style={styles.uploadingText}>Enviando seus documentos...</Text>
              </View>
            )}
          </View>
        </ScrollView>
        <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      </SafeAreaView>

      {/* Image Preview Modal */}
      <BlurModal
        visible={!!previewUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalCloseArea}
            onPress={() => setPreviewUri(null)}
            activeOpacity={1}
          >
            <View style={styles.modalImageContainer}>
              {previewUri && (
                <Image
                  source={{ uri: previewUri }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              )}
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setPreviewUri(null)}
                activeOpacity={0.8}
              >
                <IconX size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </BlurModal>

      {/* Photo Choice Modal */}
      <BlurModal
        visible={choiceModal.visible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setChoiceModal({ visible: false, type: null })}
      >
        <View style={styles.choiceModalOverlay}>
          <View style={styles.choiceModalContent}>
            <Text style={styles.choiceModalTitle}>Escolha uma opção</Text>
            <TouchableOpacity
              style={styles.choiceModalBtn}
              onPress={async () => {
                const uri = await pickImage(true);
                if (uri) {
                  if (choiceModal.type === 'front') setFrontUri(uri);
                  else setBackUri(uri);
                }
                setChoiceModal({ visible: false, type: null });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.choiceModalBtnText}>📷 Tirar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.choiceModalBtn}
              onPress={async () => {
                const uri = await pickImage();
                if (uri) {
                  if (choiceModal.type === 'front') setFrontUri(uri);
                  else setBackUri(uri);
                }
                setChoiceModal({ visible: false, type: null });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.choiceModalBtnText}>🖼️ Abrir galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceModalBtn, styles.choiceModalBtnCancel]}
              onPress={() => setChoiceModal({ visible: false, type: null })}
              activeOpacity={0.8}
            >
              <Text style={[styles.choiceModalBtnText, styles.choiceModalBtnTextCancel]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurModal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: 60 },
  backBtn: { marginBottom: spacing.md },
  backText: { color: colors.primary, fontSize: fonts.sizes.sm },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { color: '#a3c4a3', fontSize: fonts.sizes.sm, marginBottom: spacing.xl, textAlign: 'center' },

  // Step indicator - Estilo da imagem
  stepRow: {
    position: 'relative',
    height: 60,
    marginBottom: spacing.lg,
    paddingHorizontal: 40,
  },
  stepBackgroundLine: {
    position: 'absolute',
    top: 20,
    left: 70,
    right: 70,
    height: 3,
    backgroundColor: '#0E290F',
    borderRadius: 2,
  },
  stepBackgroundLineFill: {
    height: '100%',
    backgroundColor: '#1F5D18',
    borderRadius: 2,
  },
  stepItemsContainer: {
    position: 'absolute',
    top: 0,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
  },
  stepDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0E290F',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0E290F',
  },
  stepNum: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Card - Estilo da imagem
  card: {
    backgroundColor: '#082006',
    borderWidth: 2,
    borderColor: '#0F400B',
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardInner: {
    padding: spacing.lg,
  },
  cardTitle: {
    color: '#fff',
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },

  docOption: {
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#1F5D18',
    backgroundColor: '#0E290F',
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1 }],
  },
  docOptionSelected: {
    backgroundColor: '#1F5D18',
    borderColor: '#1F5D18',
    transform: [{ scale: 1.05 }],
  },
  docOptionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  docOptionTextSelected: { color: '#fff', fontWeight: '700' },
  nextButton: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: 50,
    backgroundColor: '#0F400B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    width: '80%',
    alignSelf: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  fieldLabel: { color: '#a3c4a3', fontSize: fonts.sizes.sm, marginBottom: spacing.sm, marginTop: spacing.md, fontWeight: '600' },

  // Photo side by side layout
  photosRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    justifyContent: 'space-between',
  },
  photoSideContainer: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  photoSideLabel: {
    color: '#fff',
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  photoPreviewWrapper: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#1CBB3D',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    aspectRatio: 1.6,
  },
  photoPreviewFull: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  removePhotoBtnSide: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  photosAddRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    justifyContent: 'space-between',
  },
  photoAddContainer: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  photoAddLabel: {
    color: '#fff',
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },

  // Legacy photo section styles (keep for compatibility)
  photoSection: {
    marginBottom: spacing.md,
  },
  photoPreviewContainer: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#1CBB3D',
  },
  photoPreview: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  // New separated photo buttons
  photoButtonsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  photoBtnGallery: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#1CBB3D',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(28, 187, 61, 0.08)',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  photoBtnGalleryText: {
    color: '#1CBB3D',
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  photoBtnCamera: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.08)',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  photoBtnCameraText: {
    color: '#a3c4a3',
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  cameraIconBig: {
    fontSize: 32,
  },

  // Selfie section - Camera only
  selfieSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  selfiePreviewContainer: {
    alignItems: 'center',
    width: '100%',
  },
  selfiePreviewLarge: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: '#1CBB3D',
    resizeMode: 'cover',
  },
  removeSelfieBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: 'rgba(220, 38, 38, 0.8)',
  },
  removeSelfieText: {
    color: '#fff',
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  selfieCameraBtn: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: '#1CBB3D',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 187, 61, 0.1)',
  },
  selfieCameraInner: {
    alignItems: 'center',
    gap: 8,
  },
  selfieCameraIcon: {
    fontSize: 48,
  },
  selfieCameraTitle: {
    color: '#fff',
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  selfieCameraSubtitle: {
    color: '#a3c4a3',
    fontSize: fonts.sizes.xs,
    textAlign: 'center',
    maxWidth: 140,
  },

  hint: { color: '#a3c4a3', fontSize: fonts.sizes.sm, marginBottom: spacing.lg, textAlign: 'center' },

  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  btn: { flex: 1, marginTop: spacing.lg },
  btnHalf: { flex: 1 },

  centerBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  uploadingText: { color: '#a3c4a3', marginTop: spacing.lg, fontSize: fonts.sizes.md },
  errorText: { color: '#f87171', fontSize: fonts.sizes.sm, marginTop: spacing.sm, textAlign: 'center' },

  // Novo layout Step 1 - Fotos
  photoSectionNew: {
    marginBottom: spacing.lg,
  },
  photoSectionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  photoPreviewContainerNew: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  photoPreviewTouchable: {
    width: '65%',
    alignSelf: 'center',
    aspectRatio: 1.3,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#1F5D18',
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: '#0E290F',
  },
  photoPreviewImageNew: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removePhotoBtnNew: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  photoUploadArea: {
    width: '65%',
    alignSelf: 'center',
    aspectRatio: 1.3,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#1F5D18',
    borderStyle: 'dashed',
    backgroundColor: '#0E290F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  photoUploadPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  photoActionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  photoActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 50,
    backgroundColor: '#1F5D18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  nextButtonHalf: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 50,
    backgroundColor: '#0F400B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonHalf: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 50,
    backgroundColor: '#4F4E47',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Choice Modal
  choiceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  choiceModalContent: {
    width: '100%',
    backgroundColor: '#082006',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: 40,
    borderWidth: 2,
    borderColor: '#0F400B',
    borderBottomWidth: 0,
  },
  choiceModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  choiceModalBtn: {
    paddingVertical: 16,
    borderRadius: 50,
    backgroundColor: '#1F5D18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  choiceModalBtnCancel: {
    backgroundColor: '#4F4E47',
    marginTop: spacing.sm,
  },
  choiceModalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  choiceModalBtnTextCancel: {
    color: '#fff',
  },

  // Modal de preview
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseArea: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImageContainer: {
    width: '90%',
    height: '70%',
    position: 'relative',
  },
  modalImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: -40,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Selfie section - Novo layout
  selfieSectionNew: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  selfiePreviewContainerNew: {
    position: 'relative',
    alignItems: 'center',
  },
  selfiePreviewTouchable: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: '#1F5D18',
    overflow: 'hidden',
    backgroundColor: '#0E290F',
  },
  selfiePreviewImageNew: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  selfieUploadArea: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: '#1F5D18',
    borderStyle: 'dashed',
    backgroundColor: '#0E290F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfieUploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfieCameraIconNew: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  selfieCameraTitleNew: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  selfieCameraSubtitleNew: {
    color: '#a3c4a3',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
