import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { Button } from '../components/Button';
import { api } from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/auth.store';
import { IconX, IconUpload } from '../components/Icons';
import { GameTopBarMinimal } from './HomeScreen';

type Props = { navigation: NativeStackNavigationProp<any> };

type DocType = 'RG' | 'CNH' | 'PASSPORT';

const DOC_LABELS: Record<DocType, string> = {
  RG: 'RG',
  CNH: 'CNH (Habilitação)',
  PASSPORT: 'Passaporte',
};

const STEPS = ['Tipo de Documento', 'Frente & Verso', 'Selfie', 'Enviando'];

export function KYCScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [step, setStep] = useState(0);
  const [docType, setDocType] = useState<DocType | null>(null);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickImage = async (camera = false) => {
    const { status } = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso às suas fotos ou câmera.');
      return null;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
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
        {/* Top Navigation Bar - Same as HomeScreen (no balance) */}
        <GameTopBarMinimal
          user={user}
          onSettings={() => {}}
          onExit={() => navigation.goBack()}
          onProfile={() => navigation.navigate('Main')}
          exitVariant="back"
        />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Verificação de Identidade</Text>
          <Text style={styles.subtitle}>Para liberar saques, precisamos confirmar sua identidade.</Text>

          {/* Step indicator with background line */}
          <View style={styles.stepRow}>
            {/* Background line that goes across all steps */}
            <View style={styles.stepBackgroundLine}>
              <View style={[styles.stepBackgroundLineFill, step >= 1 && styles.stepBackgroundLineFillHalf, step >= 2 && styles.stepBackgroundLineFillFull]} />
            </View>

            {/* Step items positioned over the line */}
            <View style={styles.stepItemsContainer}>
              {STEPS.slice(0, 3).map((s, i) => (
                <View key={i} style={styles.stepItem}>
                  <LinearGradient
                    colors={i <= step ? ['#1CBB3D', '#4ade80'] : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.stepDot, i <= step && styles.stepDotActive]}
                  >
                    <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>{i + 1}</Text>
                  </LinearGradient>
                  <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            {/* Step 0: Choose document type */}
            {step === 0 && (
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Qual documento você vai usar?</Text>
                {(['RG', 'CNH', 'PASSPORT'] as DocType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.docOption, docType === type && styles.docOptionSelected]}
                    onPress={() => setDocType(type)}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={docType === type ? ['rgba(28,187,61,0.3)', 'rgba(74,222,128,0.15)'] : ['transparent', 'transparent']}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={[styles.docOptionText, docType === type && styles.docOptionTextSelected]}>
                      {DOC_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
                <Button
                  title="Próximo"
                  onPress={() => { if (docType) setStep(1); }}
                  disabled={!docType}
                  style={styles.btn}
                />
              </View>
            )}

            {/* Step 1: Document photos - Side by side layout */}
            {step === 1 && (
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Foto do documento</Text>

                {/* Photos side by side when both exist */}
                {(frontUri || backUri) ? (
                  <View style={styles.photosRow}>
                    {/* Frente Preview */}
                    {frontUri && (
                      <View style={styles.photoSideContainer}>
                        <Text style={styles.photoSideLabel}>Frente</Text>
                        <View style={styles.photoPreviewWrapper}>
                          <Image source={{ uri: frontUri }} style={styles.photoPreviewFull} />
                          <TouchableOpacity
                            style={styles.removePhotoBtnSide}
                            onPress={() => setFrontUri(null)}
                            activeOpacity={0.8}
                          >
                            <IconX size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                    {/* Verso Preview */}
                    {backUri && (
                      <View style={styles.photoSideContainer}>
                        <Text style={styles.photoSideLabel}>Verso</Text>
                        <View style={styles.photoPreviewWrapper}>
                          <Image source={{ uri: backUri }} style={styles.photoPreviewFull} />
                          <TouchableOpacity
                            style={styles.removePhotoBtnSide}
                            onPress={() => setBackUri(null)}
                            activeOpacity={0.8}
                          >
                            <IconX size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ) : null}

                {/* Add buttons when photos are missing */}
                <View style={styles.photosAddRow}>
                  {/* Frente Add */}
                  {!frontUri && (
                    <View style={styles.photoAddContainer}>
                      <Text style={styles.photoAddLabel}>Frente (obrigatório)</Text>
                      <View style={styles.photoButtonsContainer}>
                        <TouchableOpacity style={styles.photoBtnGallery} onPress={async () => { const uri = await pickImage(); if (uri) setFrontUri(uri); }} activeOpacity={0.8}>
                          <IconUpload size={28} color="#4ade80" />
                          <Text style={styles.photoBtnGalleryText}>Galeria</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.photoBtnCamera} onPress={async () => { const uri = await pickImage(true); if (uri) setFrontUri(uri); }} activeOpacity={0.8}>
                          <Text style={styles.cameraIconBig}>📷</Text>
                          <Text style={styles.photoBtnCameraText}>Câmera</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  {/* Verso Add */}
                  {!backUri && (
                    <View style={styles.photoAddContainer}>
                      <Text style={styles.photoAddLabel}>Verso (opcional)</Text>
                      <View style={styles.photoButtonsContainer}>
                        <TouchableOpacity style={styles.photoBtnGallery} onPress={async () => { const uri = await pickImage(); if (uri) setBackUri(uri); }} activeOpacity={0.8}>
                          <IconUpload size={28} color="#4ade80" />
                          <Text style={styles.photoBtnGalleryText}>Galeria</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.photoBtnCamera} onPress={async () => { const uri = await pickImage(true); if (uri) setBackUri(uri); }} activeOpacity={0.8}>
                          <Text style={styles.cameraIconBig}>📷</Text>
                          <Text style={styles.photoBtnCameraText}>Câmera</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.btnRow}>
                  <Button title="Voltar" onPress={() => setStep(0)} variant="secondary" style={styles.btn} />
                  <Button title="Próximo" onPress={() => { if (frontUri) setStep(2); }} disabled={!frontUri} style={styles.btn} />
                </View>
              </View>
            )}

            {/* Step 2: Selfie - Camera only */}
            {step === 2 && (
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Selfie</Text>
                <Text style={styles.hint}>Rosto visível, boa luz, sem óculos escuros.</Text>

                <View style={styles.selfieSection}>
                  {selfieUri ? (
                    <View style={styles.selfiePreviewContainer}>
                      <Image source={{ uri: selfieUri }} style={styles.selfiePreviewLarge} />
                      <TouchableOpacity
                        style={styles.removeSelfieBtn}
                        onPress={() => setSelfieUri(null)}
                        activeOpacity={0.8}
                      >
                        <IconX size={18} color="#fff" />
                        <Text style={styles.removeSelfieText}>Tirar outra</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.selfieCameraBtn} onPress={async () => { const uri = await pickImage(true); if (uri) setSelfieUri(uri); }} activeOpacity={0.8}>
                      <View style={styles.selfieCameraInner}>
                        <Text style={styles.selfieCameraIcon}>📷</Text>
                        <Text style={styles.selfieCameraTitle}>Tirar Selfie</Text>
                        <Text style={styles.selfieCameraSubtitle}>Use a câmera ao vivo</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View style={styles.btnRow}>
                  <Button title="Voltar" onPress={() => setStep(1)} variant="secondary" style={styles.btn} />
                  <Button title="Enviar" onPress={handleSubmit} disabled={!selfieUri} loading={loading} style={styles.btn} />
                </View>
              </View>
            )}

            {/* Step 3: Uploading */}
            {step === 3 && (
              <View style={[styles.cardInner, styles.centerBox]}>
                <ActivityIndicator size="large" color="#4ade80" />
                <Text style={styles.uploadingText}>Enviando seus documentos...</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
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

  // Step indicator with background line
  stepRow: {
    position: 'relative',
    height: 80,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  stepBackgroundLine: {
    position: 'absolute',
    top: 18,
    left: spacing.xl + 18,
    right: spacing.xl + 18,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  stepBackgroundLineFill: {
    height: '100%',
    width: '0%',
    backgroundColor: '#4ade80',
    borderRadius: 2,
  },
  stepBackgroundLineFillHalf: {
    width: '50%',
  },
  stepBackgroundLineFillFull: {
    width: '100%',
  },
  stepItemsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  stepItem: {
    alignItems: 'center',
  },
  stepDot: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stepDotActive: {
    backgroundColor: '#1CBB3D',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  stepNum: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '700' },
  stepNumActive: { color: '#fff', fontWeight: '800' },
  stepLabel: { color: '#6b9e6b', fontSize: 11, textAlign: 'center', maxWidth: 90, fontWeight: '500' },
  stepLabelActive: { color: '#4ade80', fontWeight: '700' },

  // Card styled like LoginScreen
  card: {
    backgroundColor: 'rgba(34, 92, 52, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.16)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  cardInner: {
    padding: spacing.xl,
  },
  cardTitle: {
    color: '#fff',
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },

  docOption: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  docOptionSelected: { borderColor: '#4ade80' },
  docOptionText: { color: '#a3c4a3', fontSize: fonts.sizes.md },
  docOptionTextSelected: { color: '#4ade80', fontWeight: '700' },

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
    borderColor: '#4ade80',
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
    borderColor: '#4ade80',
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
    borderColor: '#4ade80',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  photoBtnGalleryText: {
    color: '#4ade80',
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
    borderColor: '#4ade80',
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
    borderColor: '#4ade80',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
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

  centerBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  uploadingText: { color: '#a3c4a3', marginTop: spacing.lg, fontSize: fonts.sizes.md },
  errorText: { color: '#f87171', fontSize: fonts.sizes.sm, marginTop: spacing.sm, textAlign: 'center' },
});
