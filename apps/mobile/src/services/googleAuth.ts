import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  configured = true;
}

export class GoogleSignInCancelledError extends Error {}

// Runs the native Google Sign-In sheet and returns the ID token to send to
// POST /auth/google. Audience of that token is the Web client configured
// above, matching what the backend verifies against (config.google.webClientId).
export async function signInWithGoogle(): Promise<string> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new GoogleSignInCancelledError('Login cancelado');

  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Não foi possível obter o token do Google');
  return idToken;
}

export function googleSignInErrorMessage(err: any): string {
  if (err instanceof GoogleSignInCancelledError) return '';
  if (isErrorWithCode(err)) {
    switch (err.code) {
      case statusCodes.SIGN_IN_CANCELLED:
        return '';
      case statusCodes.IN_PROGRESS:
        return 'Login com Google já em andamento';
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return 'Google Play Services não disponível neste dispositivo';
      default:
        return 'Erro ao entrar com Google. Tente novamente.';
    }
  }
  return 'Erro ao entrar com Google. Tente novamente.';
}
