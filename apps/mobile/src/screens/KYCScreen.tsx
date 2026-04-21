import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ImageBackground, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { Button } from '../components/Button';
import { api } from '../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = { navigation: NativeStackNavigationProp<any> };

type DocType = 'RG' | 'CNH' | 'PASSPORT';

const DOC_LABELS: Record<DocType, string> = {
  RG: 'RG',
  CNH: 'CNH (Habilitação)',
  PASSPORT: 'Passaporte',
};

const STEPS = ['Tipo de Documento', 'Frente & Verso', 'Selfie', 'Enviando'];

export function KYCScreen({ navigation }: Props) {
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
      form.append('front', { uri: frontUri, type: 'image/jpeg', name: 'front.jpg' } as any);
      if (backUri) form.append('back', { uri: backUri, type: 'image/jpeg', name: 'back.jpg' } as any);
      form.append('selfie', { uri: selfieUri, type: 'image/jpeg', name: 'selfie.jpg' } as any);

      await api.post('/kyc/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert(
        'Documentos enviados!',
        'Sua verificação de identidade será analisada em até 48 horas. Você receberá uma notificação quando for aprovada.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar documentos. Tente novamente.');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix]}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Verificação de Identidade</Text>
          <Text style={styles.subtitle}>Para liberar saques, precisamos confirmar sua identidade.</Text>

          {/* Step indicator */}
          <View style={styles.stepRow}>
            {STEPS.slice(0, 3).map((s, i) => (
              <View key={i} style={styles.stepItem}>
                <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{s}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            {/* Step 0: Choose document type */}
            {step === 0 && (
              <View>
                <Text style={styles.cardTitle}>Qual documento você vai usar?</Text>
                {(['RG', 'CNH', 'PASSPORT'] as DocType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.docOption, docType === type && styles.docOptionSelected]}
                    onPress={() => setDocType(type)}
                  >
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

            {/* Step 1: Document photos */}
            {step === 1 && (
              <View>
                <Text style={styles.cardTitle}>Foto do documento</Text>

                <Text style={styles.fieldLabel}>Frente (obrigatório)</Text>
                <View style={styles.photoRow}>
                  <TouchableOpacity style={styles.photoBtn} onPress={async () => { const uri = await pickImage(); if (uri) setFrontUri(uri); }}>
                    {frontUri ? <Image source={{ uri: frontUri }} style={styles.photoThumb} /> : <Text style={styles.photoBtnText}>Galeria</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={async () => { const uri = await pickImage(true); if (uri) setFrontUri(uri); }}>
                    <Text style={styles.photoBtnText}>Câmera</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Verso (opcional)</Text>
                <View style={styles.photoRow}>
                  <TouchableOpacity style={styles.photoBtn} onPress={async () => { const uri = await pickImage(); if (uri) setBackUri(uri); }}>
                    {backUri ? <Image source={{ uri: backUri }} style={styles.photoThumb} /> : <Text style={styles.photoBtnText}>Galeria</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={async () => { const uri = await pickImage(true); if (uri) setBackUri(uri); }}>
                    <Text style={styles.photoBtnText}>Câmera</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.btnRow}>
                  <Button title="Voltar" onPress={() => setStep(0)} style={[styles.btn, styles.btnSecondary]} />
                  <Button title="Próximo" onPress={() => { if (frontUri) setStep(2); }} disabled={!frontUri} style={styles.btn} />
                </View>
              </View>
            )}

            {/* Step 2: Selfie */}
            {step === 2 && (
              <View>
                <Text style={styles.cardTitle}>Selfie</Text>
                <Text style={styles.hint}>Rosto visível, boa luz, sem óculos escuros.</Text>

                <View style={styles.selfieBox}>
                  {selfieUri
                    ? <Image source={{ uri: selfieUri }} style={styles.selfiePreview} />
                    : <Text style={styles.selfieIcon}>🤳</Text>
                  }
                </View>

                <View style={styles.photoRow}>
                  <TouchableOpacity style={styles.photoBtn} onPress={async () => { const uri = await pickImage(); if (uri) setSelfieUri(uri); }}>
                    <Text style={styles.photoBtnText}>Galeria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={async () => { const uri = await pickImage(true); if (uri) setSelfieUri(uri); }}>
                    <Text style={styles.photoBtnText}>Câmera</Text>
                  </TouchableOpacity>
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View style={styles.btnRow}>
                  <Button title="Voltar" onPress={() => setStep(1)} style={[styles.btn, styles.btnSecondary]} />
                  <Button title="Enviar" onPress={handleSubmit} disabled={!selfieUri} loading={loading} style={styles.btn} />
                </View>
              </View>
            )}

            {/* Step 3: Uploading */}
            {step === 3 && (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.uploadingText}>Enviando seus documentos...</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: 60 },
  backBtn: { marginBottom: spacing.md },
  backText: { color: colors.primary, fontSize: fonts.sizes.sm },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: spacing.xs },
  subtitle: { color: '#a3c4a3', fontSize: fonts.sizes.sm, marginBottom: spacing.xl },

  stepRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepNum: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLabel: { color: '#6b9e6b', fontSize: 11, textAlign: 'center' },
  stepLabelActive: { color: '#fff' },

  card: {
    backgroundColor: 'rgba(34,92,52,0.55)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(187,255,0,0.15)',
    padding: spacing.xl,
  },
  cardTitle: { color: '#fff', fontSize: fonts.sizes.lg, fontWeight: '700', marginBottom: spacing.lg },

  docOption: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
  },
  docOptionSelected: { borderColor: colors.primary, backgroundColor: 'rgba(74,222,128,0.15)' },
  docOptionText: { color: '#a3c4a3', fontSize: fonts.sizes.md },
  docOptionTextSelected: { color: colors.primary, fontWeight: '700' },

  fieldLabel: { color: '#a3c4a3', fontSize: fonts.sizes.sm, marginBottom: spacing.xs, marginTop: spacing.md },
  photoRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  photoBtn: {
    flex: 1,
    height: 80,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  photoBtnText: { color: '#a3c4a3', fontSize: fonts.sizes.sm },
  photoThumb: { width: '100%', height: '100%', resizeMode: 'cover' },

  selfieBox: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  selfiePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  selfieIcon: { fontSize: 56 },
  hint: { color: '#a3c4a3', fontSize: fonts.sizes.sm, marginBottom: spacing.lg, textAlign: 'center' },

  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  btn: { flex: 1, marginTop: spacing.lg },
  btnSecondary: { backgroundColor: 'rgba(255,255,255,0.1)' },

  centerBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  uploadingText: { color: '#a3c4a3', marginTop: spacing.lg, fontSize: fonts.sizes.md },
  errorText: { color: '#f87171', fontSize: fonts.sizes.sm, marginTop: spacing.sm, textAlign: 'center' },
});
