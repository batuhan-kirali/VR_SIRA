import { isEmailValidOptional, isPhoneValidOptional } from './hash';

export type WizardStep = 1 | 2 | 3 | 4;

export interface SurveyAnswers {
  q1: string;
  q2: string;
  q3: string;
}

export interface RegistrationFormData {
  fullName: string;
  phone: string;
  email: string;
  kvkkAccepted: boolean;
  survey: SurveyAnswers;
}

export interface RegistrationRecord {
  code: string;
  fullName: string;
  phone: string;
  email: string;
  kvkkAccepted: boolean;
  survey: SurveyAnswers;
  createdAtIso: string;
  isExisting: boolean;
}

export type TemporaryRegistrationRecord = RegistrationRecord;

export interface PublicQueuePayload<TTimestamp> {
  code: string;
  queueOrder: number;
  status: 'waiting';
  skipCount: 0;
  lastSkippedAt: null;
  createdAt: TTimestamp;
}

export interface PrivateRegistrationPayload<TTimestamp> {
  code: string;
  fullName: string;
  phone: string;
  email: string;
  kvkkAccepted: true;
  kvkkAcceptedAt: TTimestamp;
  survey: SurveyAnswers;
  createdAt: TTimestamp;
}

export interface ContactLockPayload<TTimestamp> {
  code: string;
  active: true;
  createdAt: TTimestamp;
}

export interface SurveyStepDefinition {
  step: 2 | 3 | 4;
  answerKey: keyof SurveyAnswers;
  question: string;
  options: readonly string[];
  primaryActionLabel: string;
}

export const MOODIST_VR_CODE_STORAGE_KEY = 'moodist_vr_code';

export const INITIAL_REGISTRATION_DATA: RegistrationFormData = {
  fullName: '',
  phone: '',
  email: '',
  kvkkAccepted: false,
  survey: {
    q1: '',
    q2: '',
    q3: '',
  },
};

export const SURVEY_STEPS: readonly SurveyStepDefinition[] = [
  {
    step: 2,
    answerKey: 'q1',
    question: 'Sanal Gerçeklik (VR) Terapisini daha önce duymuş muydunuz?',
    options: [
      'İlk kez burada duyuyorum',
      'Duydum ama hiç deneyimlemedim',
      'Daha önce deneyimledim',
    ],
    primaryActionLabel: 'Devam Et',
  },
  {
    step: 3,
    answerKey: 'q2',
    question: 'VR Terapinin hangi alandaki kullanımı en çok ilginizi çekiyor?',
    options: [
      'Fobiler ve Kaygı (Yükseklik, kalabalık, hayvan vb.)',
      'Travma ve Stres Yönetimi',
      'Sosyal Fobi ve Sınav Kaygısı',
      'Bağımlılık ve Yeme Bozuklukları',
      'Hepsi merak uyandırıcı',
    ],
    primaryActionLabel: 'Devam Et',
  },
  {
    step: 4,
    answerKey: 'q3',
    question: 'Bugünkü VR deneyiminden temel beklentiniz nedir?',
    options: [
      'Teknolojiyi yakından tanımak',
      'Psikolojide nasıl uygulandığını görmek',
      'Kendim veya bir yakınım için bilgi almak',
    ],
    primaryActionLabel: 'Sıra Al',
  },
] as const;

export function formatTrackingCode(orderNumber: number): string {
  if (!Number.isInteger(orderNumber) || orderNumber < 1) {
    throw new Error(`Invalid queue order number: ${orderNumber}`);
  }
  return `VR-${String(orderNumber).padStart(2, '0')}`;
}

export function isActiveQueueStatus(status: unknown): boolean {
  return status !== 'completed';
}

export function isPersonalInfoValid(data: RegistrationFormData): boolean {
  return (
    data.fullName.trim().length > 0 &&
    data.kvkkAccepted === true &&
    isPhoneValidOptional(data.phone) &&
    isEmailValidOptional(data.email)
  );
}

export function isStepValid(step: WizardStep, data: RegistrationFormData): boolean {
  switch (step) {
    case 1:
      return isPersonalInfoValid(data);
    case 2:
      return data.survey.q1.trim().length > 0;
    case 3:
      return data.survey.q2.trim().length > 0;
    case 4:
      return data.survey.q3.trim().length > 0;
  }
}

export function getSurveyDefinition(step: 2 | 3 | 4): SurveyStepDefinition {
  const found = SURVEY_STEPS.find((item) => item.step === step);
  if (!found) {
    throw new Error(`Unknown survey step: ${step}`);
  }
  return found;
}

export function buildPublicQueuePayload<TTimestamp>(
  code: string,
  queueOrder: number,
  createdAt: TTimestamp,
): PublicQueuePayload<TTimestamp> {
  return {
    code,
    queueOrder,
    status: 'waiting',
    skipCount: 0,
    lastSkippedAt: null,
    createdAt,
  };
}

export function buildPrivateRegistrationPayload<TTimestamp>(
  code: string,
  data: RegistrationFormData,
  timestamp: TTimestamp,
): PrivateRegistrationPayload<TTimestamp> {
  return {
    code,
    fullName: data.fullName.trim(),
    phone: data.phone.trim() || '',
    email: data.email.trim() || '',
    kvkkAccepted: true,
    kvkkAcceptedAt: timestamp,
    survey: {
      q1: data.survey.q1,
      q2: data.survey.q2,
      q3: data.survey.q3,
    },
    createdAt: timestamp,
  };
}

export function buildContactLockPayload<TTimestamp>(
  code: string,
  createdAt: TTimestamp,
): ContactLockPayload<TTimestamp> {
  return {
    code,
    active: true,
    createdAt,
  };
}

export function createRegistrationRecord(
  code: string,
  data: RegistrationFormData,
  now: Date = new Date(),
  isExisting: boolean = false,
): RegistrationRecord {
  return {
    code,
    fullName: data.fullName.trim(),
    phone: data.phone.trim(),
    email: data.email.trim(),
    kvkkAccepted: data.kvkkAccepted,
    survey: {
      q1: data.survey.q1,
      q2: data.survey.q2,
      q3: data.survey.q3,
    },
    createdAtIso: now.toISOString(),
    isExisting,
  };
}

export function formatFirestoreRegistrationError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'permission-denied':
      return 'Kayıt yetkisi doğrulanamadı. Lütfen görevli ile iletişime geçin.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
    case 'aborted':
      return 'Yoğunluk nedeniyle sıra alınamadı. Lütfen tekrar deneyin.';
    default:
      return 'Sıra kaydı sırasında bir hata oluştu. Lütfen tekrar deneyin.';
  }
}
