import type { ImageSourcePropType } from 'react-native';

export type TutorKey = string;
export type Tutor = {
  key: TutorKey;
  name: string;
  voiceId?: string;
  gender: 'female' | 'male';
  countries: string[];
  languages: string[];
  persona: string;
  avatar: ImageSourcePropType;
};

// Public tutor identities. Provider voice names and agent IDs never leave the server.
export const TUTORS: Tutor[] = [
  { key: 'ADJOUA', name: 'Amina', gender: 'female', countries: ['CI', 'SN', 'CM', 'CG', 'FR', 'MA', 'TN', 'AE'], languages: ['fr', 'en'], persona: 'Chaleureuse, structurée et encourageante.', avatar: require('../assets/voices/adjoua.png') },
  { key: 'KOUADIO', name: 'Nabil', gender: 'male', countries: ['CI', 'SN', 'CM', 'CG', 'FR', 'MA', 'TN', 'AE'], languages: ['fr', 'en'], persona: 'Direct, pragmatique et orienté résultat.', avatar: require('../assets/voices/kouadio.png') },
  { key: 'NANA', name: 'Imara', gender: 'female', countries: ['GH', 'NG', 'KE'], languages: ['en', 'fr'], persona: 'Posée, précise et tournée vers la progression.', avatar: require('../assets/voices/nana.png') },
  { key: 'KAMAU', name: 'Kato', gender: 'male', countries: ['KE', 'GH', 'NG'], languages: ['en', 'sw'], persona: 'Calme, analytique et concret.', avatar: require('../assets/voices/kamau.png') },
  { key: 'KEMI', name: 'Sade', gender: 'female', countries: ['NG', 'GH'], languages: ['en', 'fr'], persona: 'Énergique, bienveillante et exigeante.', avatar: require('../assets/voices/kemi.png') },
];

export function tutorForKey(key?: string) { return TUTORS.find((tutor) => tutor.key === key) || TUTORS[0]; }
export function tutorsForCountry(country: string) {
  const code = country.trim().toUpperCase();
  const regional = TUTORS.filter((tutor) => tutor.countries.includes(code));
  return regional.length ? regional : TUTORS.filter((tutor) => tutor.key === 'ADJOUA' || tutor.key === 'KOUADIO');
}

export function tutorsFromAethexVoices(voices: Array<{ id: string; name: string; language: string; gender?: string; country?: string }>): Tutor[] {
  const fallbackAvatars = TUTORS.map((tutor) => tutor.avatar);
  return voices.map((voice, index) => ({
    key: `AETHEX_${voice.id}`,
    voiceId: voice.id,
    name: voice.name,
    gender: voice.gender === 'male' ? 'male' : 'female',
    countries: [voice.country || 'CI'],
    languages: [voice.language],
    persona: 'Voix ivoirienne Aethex.',
    avatar: fallbackAvatars[index % fallbackAvatars.length],
  }));
}
