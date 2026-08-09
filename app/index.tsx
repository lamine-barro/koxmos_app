import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlignLeft, ArrowLeft, ArrowRight, ArrowUp as LucideArrowUp, AudioLines, Check, ChevronDown, Circle, Download, Eye, EyeOff, Flame, Mic as LucideMic, Plus, Save, Search, Trash2, UserRound, Wallet, X } from 'lucide-react-native';
import { addTestCredit, createLearningSession, deleteRemoteAccount, endVoiceSession, heartbeatVoiceSession, loadFlame, loadWallet, recordPractice, requestRecharge, startLearningEvaluation, startVoiceSession, streamTextTutor, type LearningSession, type TextTutorStreamEvent, type Wallet as WalletData } from '../core/agent';
import { AgentRequestError } from '../core/errors';
import { startRealtimeConversation } from '../core/realtime';
import { clearConversationHistory, deleteConversationHistory, loadConversationHistory, saveConversationHistory, type ConversationHistory } from '../core/history';
import { addSkill, applyAgentAssessment, applyAssessment, createTransferCode, importTransferCode, loadSkills, removeSkill, searchSkills, setEvaluationProgress, setSkillHidden, type Skill } from '../core/passport';
import { FIRST_NAME_MAX_LENGTH, deleteLocalPassport, type LocalProfile, loadProfile, saveProfile } from '../core/profile';
import { localeForCountry, MARKETS, marketCodes, type Locale } from '../core/markets';
import { dateLocale, plural, t } from '../core/i18n';
import { tutorsForCountry, type Tutor } from '../core/tutors';

const MARKET_FLAGS: Record<keyof typeof MARKETS, string> = { CI: '🇨🇮', CM: '🇨🇲', CG: '🇨🇬', FR: '🇫🇷', MA: '🇲🇦', SN: '🇸🇳', TN: '🇹🇳', AE: '🇦🇪', EG: '🇪🇬', GH: '🇬🇭', KE: '🇰🇪', NG: '🇳🇬', US: '🇺🇸' };
type Page = 'home' | 'skill' | 'text' | 'voice' | 'wallet' | 'transfer' | 'search' | 'profile' | 'profile-details' | 'history';
type Message = { role: 'talent' | 'tuteur'; text: string };
type Notice = { title: string; message?: string; tone?: 'success' | 'info' } | null;
const LocaleContext = React.createContext<Locale>('fr');
function useCopy() { const locale = useContext(LocaleContext); return { locale, tr: (key: Parameters<typeof t>[1], values?: Record<string, string | number>) => t(locale, key, values) }; }

function Mic(props: React.ComponentProps<typeof LucideMic>) { return <LucideMic {...props} color={props.color === '#FFFFFF' ? '#000000' : props.color} />; }
function ArrowUp(props: React.ComponentProps<typeof LucideArrowUp>) { return <LucideArrowUp {...props} color="#FFFFFF" />; }
const TextAlignStart = AlignLeft;

function formatRemainingTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safeSeconds / 60)} min ${String(safeSeconds % 60).padStart(2, '0')} s`;
}
function formatCredits(balanceCredits: number, locale: Locale) {
  const value = Math.max(0, Math.round(balanceCredits * 100) / 100);
  const amount = value.toLocaleString(dateLocale(locale), { maximumFractionDigits: 2 });
  return t(locale, 'credits', { amount, plural: plural(locale, value) });
}
function formatMetricValue(value: number, locale: Locale) {
  return Math.max(0, Math.round(value * 100) / 100).toLocaleString(dateLocale(locale), { maximumFractionDigits: 2 });
}
function compactConversation(messages: Message[]) {
  return messages.slice(-8).map((item) => `${item.role === 'talent' ? 'Talent' : 'Tuteur'}: ${item.text}`).join('\n').slice(-1600);
}

export default function HomeScreen() {
  const [profile, setProfile] = useState<LocalProfile | null | undefined>(undefined);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [page, setPage] = useState<Page>('home');
  const [selected, setSelected] = useState<Skill>();
  const [firstName, setFirstName] = useState('');
  const [country, setCountry] = useState('CI');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillSearch, setSkillSearch] = useState('');
  const [skillSearchOpen, setSkillSearchOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [learningSession, setLearningSession] = useState<LearningSession>();
  const [working, setWorking] = useState(false);
  const [textConversationCredits, setTextConversationCredits] = useState(0);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [walletBack, setWalletBack] = useState<'home' | 'profile'>('home');
  const [flame, setFlame] = useState(0);
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [locked, setLocked] = useState(false);
  const [tutor, setTutor] = useState<Tutor>();
  const [catalogTutors, setCatalogTutors] = useState<Tutor[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const replyAbort = useRef<AbortController | null>(null);
  const locale = localeForCountry(profile?.country ?? country);
  const tr = (key: Parameters<typeof t>[1], values?: Record<string, string | number>) => t(locale, key, values);

  function notify(title: string, message?: string, tone: 'success' | 'info' = 'success') {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ title, message, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }

  function view(content: React.ReactNode) {
    return <LocaleContext.Provider value={locale}>{content}<Toast notice={notice} dismiss={() => setNotice(null)} /></LocaleContext.Provider>;
  }

  async function unlock(stored: LocalProfile | null) {
    if (!stored) return true;
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hardware || !enrolled) return true;
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Déverrouillez votre passeport Koxmos', cancelLabel: 'Annuler', disableDeviceFallback: true });
    return result.success;
  }

  useEffect(() => {
    (async () => {
      const stored = await loadProfile();
      const unlocked = await unlock(stored);
      setProfile(stored);
      setLocked(!unlocked);
      if (unlocked) {
        setSkills(await loadSkills());
        setFlame(await loadFlame().catch(() => 0));
        setWallet(await loadWallet().catch(() => null));
        if (stored) setPage('home');
      }
    })().catch(() => setProfile(null));
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, []);

  useEffect(() => {
    if (!profile) return;
    const available = tutorsForCountry(profile.country);
    setCatalogTutors(available);
    setTutor((selectedTutor) => available.find((item) => item.key === selectedTutor?.key) || available[0]);
  }, [profile?.country]);

  useEffect(() => {
    if (!profile?.saveConversationHistory || !learningSession || !messages.some((message) => message.text.trim())) return;
    const timer = setTimeout(() => { void saveConversationHistory({ id: learningSession.id, tutor: tutor?.name || learningSession.tutor, skill: selected?.name || learningSession.skill, updatedAt: new Date().toISOString(), messages }); }, 800);
    return () => clearTimeout(timer);
  }, [profile?.saveConversationHistory, learningSession?.id, messages, tutor?.name, selected?.name]);

  useEffect(() => {
    if (skillSearchOpen) setPage('search');
  }, [skillSearchOpen]);

  async function createProfile() {
    if (!firstName.trim()) return notify(tr('nameRequired'), tr('nameRequiredCopy'), 'info');
    setWorking(true);
    try {
      setProfile(await saveProfile(firstName, country));
      setPage('home');
      notify(tr('profileCreated'), tr('profileCreatedCopy'));
    } catch (error) { Alert.alert(tr('profileError'), error instanceof Error ? error.message : tr('error')); } finally { setWorking(false); }
  }

  async function saveSkill() {
    try {
      const next = await addSkill(skillName);
      setSkills(next); setSelected(next[0]); setSkillName(''); setPage('home');
      notify(tr('skillAdded'), tr('skillAddedCopy'));
    } catch (error) { notify(tr('skillNew'), error instanceof Error ? error.message : tr('unavailable'), 'info'); }
  }

  async function chat() {
    if (!profile || !draft.trim() || working) return;
    const text = draft.trim(); const activeLearning = await ensureLearningSession(); if (!activeLearning) return; setDraft(''); setMessages((items) => [...items, { role: 'talent', text }, { role: 'tuteur', text: '' }]); setWorking(true);
    try {
      replyAbort.current = new AbortController();
      const handleEvent = async (event: TextTutorStreamEvent) => {
        if (event.type === 'delta') { setMessages((items) => [...items.slice(0, -1), { role: 'tuteur', text: `${items.at(-1)?.text || ''}${event.delta}` }]); return; }
        // The phone owns the multimodal transcript. The broker session only
        // carries evaluation state, so it must never replace local voice turns.
        if (event.session) setLearningSession(event.session);
        if (event.evaluation && selected) { const next = await setEvaluationProgress(selected.id, event.evaluation); setSkills(next); setSelected(next.find((item) => item.id === selected.id)); }
        if (event.wallet) setWallet(event.wallet);
        const chargedCredits = event.chargedCredits; if (chargedCredits) setTextConversationCredits((total) => total + chargedCredits);
        if (event.proposal && selected) { const proposal = { ...event.proposal, assessedAt: new Date().toISOString(), tutor: 'Koxmos AI' }; const next = await applyAssessment(selected.id, proposal); setSkills(next); setSelected(next.find((item) => item.id === selected.id)); notify(tr('passportUpdated'), tr('passportUpdatedCopy', { name: selected.name, level: proposal.level })); }
      };
      const send = (session: LearningSession) => streamTextTutor({ firstName: profile.firstName, country: profile.country, tutorKey: tutor?.key, skill: selected?.name, skillLevel: selected?.level, learningSessionId: session.id, clientContext: compactConversation(messages), message: text }, handleEvent, replyAbort.current?.signal);
      try { await send(activeLearning); }
      catch (error) {
        if (!(error instanceof AgentRequestError) || error.status !== 404 || !selected) throw error;
        const recreated = await createLearningSession({ skill: selected.name, level: selected.level, tutor: tutor?.name || 'Koxmos' });
        setLearningSession(recreated); await send(recreated);
      }
    } catch (error) { setMessages((items) => items.at(-1)?.role === 'tuteur' && !items.at(-1)?.text ? items.slice(0, -1) : items); if ((error as Error).name !== 'AbortError') notify(tr('tutorUnavailable'), error instanceof Error ? error.message : tr('retry'), 'info'); } finally { replyAbort.current = null; setWorking(false); }
  }
  function cancelReply() { replyAbort.current?.abort(); }
  function leaveTextConversation() { if (textConversationCredits > 0) notify(tr('conversationEnded'), tr('creditsUsed', { amount: textConversationCredits.toLocaleString(dateLocale(locale), { maximumFractionDigits: 2 }), plural: plural(locale, textConversationCredits) })); setTextConversationCredits(0); setPage('home'); }

  async function beginAssessment() {
    if (!selected) return notify('Choisissez une compétence', 'Sélectionnez d’abord la compétence à évaluer.', 'info');
    const activeLearning = await ensureLearningSession(); if (!activeLearning) return;
    const serverSession = await startLearningEvaluation(activeLearning.id);
    setLearningSession(serverSession); setMessages(serverSession.messages.map((item) => ({ role: item.role, text: item.text })));
    const next = await setEvaluationProgress(selected.id, serverSession.evaluation);
    setSkills(next); setSelected(next.find((skill) => skill.id === selected.id));
    notify('Mise à jour réussie', 'Évaluation en 5 questions démarrée.');
  }

  async function ensureLearningSession() {
    if (learningSession) return learningSession;
    if (!selected) { notify('Choisissez une compétence', 'Sélectionnez la compétence avant de démarrer le tuteur.', 'info'); return undefined; }
    try { const created = await createLearningSession({ skill: selected.name, level: selected.level, tutor: tutor?.name || 'Koxmos' }); setLearningSession(created); setMessages(created.messages.map((item) => ({ role: item.role, text: item.text }))); return created; }
    catch (error) { notify('Conversation indisponible', error instanceof Error ? error.message : 'Réessayez dans un instant.', 'info'); return undefined; }
  }

  function chooseTutor(nextTutor: Tutor) {
    setTutor(nextTutor);
    setLearningSession(undefined);
    setMessages([]);
  }

  function chooseSkill(skill: Skill) {
    setSelected(skill);
    setLearningSession(undefined);
    setMessages([]);
  }

  async function openWallet() { try { setWallet(await loadWallet()); setWalletBack('home'); setPage('wallet'); } catch (error) { notify('Temps indisponible', error instanceof Error ? error.message : 'Broker non configuré', 'info'); } }
  async function exportPassport() {
    if (!profile) return;
    try {
      const next = await createTransferCode(profile, skills, secret); setCode(next); await Clipboard.setStringAsync(next);
      notify('Export prêt', 'Copiez le code affiché pour le conserver.');
    }
    catch (error) { notify('Export impossible', error instanceof Error ? error.message : 'Erreur', 'info'); }
  }
  async function importPassport() {
    try { const next = await importTransferCode(code, secret); setSkills(next.skills); setProfile(await saveProfile(next.profile.firstName, next.profile.country)); setPage('home'); notify('Passeport importé', 'Vos compétences sont maintenant disponibles sur cet appareil.'); }
    catch (error) { notify('Import impossible', error instanceof Error ? error.message : 'Vérifiez le code et la phrase secrète.', 'info'); }
  }

  if (profile === undefined) return view(<Center><ActivityIndicator size="large" color="#111827" /><Text style={s.copy}>{tr('preparing')}</Text></Center>);
  if (locked) return view(<Center><Text style={s.kicker}>{tr('protectedPassport')}</Text><Text style={s.title}>{tr('locked')}</Text><Text style={s.copy}>{tr('protected')}</Text><Button title={tr('unlock')} onPress={async () => { if (await unlock(profile)) { setLocked(false); setSkills(await loadSkills()); } }} /></Center>);
  if (!profile) return view(<Center><Text style={s.kicker}>{tr('passport')}</Text><Text style={s.title}>{tr('welcome')}</Text><Text style={s.copy}>{tr('welcomeCopy')}</Text><TextInput value={firstName} maxLength={FIRST_NAME_MAX_LENGTH} onChangeText={setFirstName} placeholder={tr('firstName')} placeholderTextColor="#6B7280" autoCapitalize="words" returnKeyType="next" style={s.input} /><CountrySelect value={country} open={countryPickerOpen} onOpen={() => setCountryPickerOpen(true)} onClose={() => setCountryPickerOpen(false)} onChange={setCountry} /><Button title={working ? tr('creating') : tr('create')} disabled={working} onPress={createProfile} /></Center>);

  const profileMenu = <ProfileScreen openDetails={() => setPage('profile-details')} openHistory={() => setPage('history')} openBilling={() => { setWalletBack('profile'); setPage('wallet'); }} back={() => setPage('home')} />;

  const activeProfile: LocalProfile = profile;
  function renderHome() {
    const regionalTutors = catalogTutors.length ? catalogTutors : tutorsForCountry(activeProfile.country);
    const displayedSkills = searchSkills(skills, skillSearch, true);
    return <HomeContent
      profile={activeProfile}
      tutor={tutor}
      tutors={regionalTutors}
      skills={displayedSkills}
      selected={selected}
      flame={flame}
      wallet={wallet}
      openWallet={openWallet}
      openExport={() => setPage('transfer')}
      startConversation={() => { if (!tutor || !selected) return; setMessages([]); setPage('voice'); }}
      selectTutor={chooseTutor}
      openProfile={() => setPage('profile')}
      openSearch={() => setSkillSearchOpen(true)}
      addSkill={() => setPage('skill')}
      selectSkill={chooseSkill}
      toggleHidden={async (skill) => { const next = await setSkillHidden(skill.id, !skill.isHidden); setSkills(next); setSelected(next.find((item) => item.id === skill.id)); notify(skill.isHidden ? 'Compétence affichée' : 'Compétence masquée'); }}
      removeSkill={(skill) => Alert.alert('Supprimer cette compétence ?', `${skill.name} sera retirée de ce passeport.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { const next = await removeSkill(skill.id); setSkills(next); if (selected?.id === skill.id) setSelected(next[0]); notify('Compétence supprimée'); } }])}
    />;
  }

  const layers: React.ReactNode[] = [];
  const addLayer = (key: string, content: React.ReactNode) => layers.push(<View key={key} style={s.pageOverlay}>{content}</View>);
  const profileIsUnderneath = page === 'profile' || page === 'profile-details' || page === 'history' || (page === 'wallet' && walletBack === 'profile');
  if (profileIsUnderneath) addLayer('profile', profileMenu);

  if (page === 'skill') addLayer('skill', <Screen title={tr('skillNew')} back={() => setPage('home')}><Text style={s.copy}>{tr('skillIntro')}</Text><TextInput value={skillName} onChangeText={setSkillName} placeholder={tr('skillExample')} placeholderTextColor="#6B7280" autoFocus returnKeyType="done" onSubmitEditing={saveSkill} style={s.input} /><Button title={tr('addSkill')} onPress={saveSkill} /></Screen>);
  if (page === 'wallet') addLayer('wallet', <Screen title={tr('wallet')} back={() => setPage(walletBack)}><Text style={s.title}>{formatCredits(wallet?.balanceCredits || 0, locale)}</Text><Text style={s.copy}>{tr('creditInfo')}</Text><Text style={s.sectionTitle}>{tr('recharge')}</Text><View style={s.rechargeList}>{[30, 60, 300, 600].map((item) => <Pressable key={item} accessibilityRole="button" style={s.rechargePlan} onPress={() => requestRecharge(item).then(() => notify(tr('paymentPending'), tr('paymentPendingCopy'), 'info')).catch((error) => notify(tr('rechargeUnavailable'), error instanceof Error ? error.message : tr('retry'), 'info'))}><Text style={s.skillName}>{formatCredits(item, locale)}</Text><Text style={s.price}>{item * 100} FCFA</Text><ArrowRight size={18} color="#374151" /></Pressable>)}</View><Text style={s.notice}>{tr('paymentNotice')}</Text><Button title={tr('testCredit')} onPress={async () => { setWallet(await addTestCredit(500)); notify(tr('testCreditAdded'), tr('testCreditAddedCopy')); }} /></Screen>);
  if (page === 'transfer') addLayer('transfer', <Screen title={tr('transfer')} back={() => setPage('home')}><Text style={s.copy}>{tr('transferCopy')}</Text><TextInput value={secret} secureTextEntry onChangeText={setSecret} placeholder={tr('secret')} placeholderTextColor="#6B7280" style={s.input} /><Button title={tr('export')} onPress={exportPassport} /><TextInput value={code} onChangeText={setCode} multiline placeholder="Code KOXMOS3…" placeholderTextColor="#6B7280" style={[s.input, s.tall]} /><Button title={tr('import')} onPress={importPassport} /></Screen>);
  if (page === 'profile-details') addLayer('profile-details', <ProfileDetailsScreen profile={profile} save={async (name, nextCountry, saveConversationHistory) => { const updated = await saveProfile(name, nextCountry, { saveConversationHistory }); if (!saveConversationHistory) await clearConversationHistory(); setProfile(updated); notify(tr('profileSaved')); }} deletePassport={async () => { await deleteRemoteAccount().catch(() => undefined); await deleteLocalPassport(); setProfile(null); setSkills([]); setSelected(undefined); setTutor(undefined); setWallet(null); setFirstName(''); setCountry('CI'); setPage('home'); }} back={() => setPage('profile')} />);
  if (page === 'history') addLayer('history', <ConversationHistoryScreen back={() => setPage('profile')} />);
  if (page === 'search') addLayer('search', <SkillSearchScreen skills={skills} query={skillSearch} onQueryChange={setSkillSearch} select={(skill) => { setSkillSearch(''); setSkillSearchOpen(false); chooseSkill(skill); setPage('home'); }} back={() => { setSkillSearch(''); setSkillSearchOpen(false); setPage('home'); }} />);
  if (page === 'text') addLayer('text', <ChatScreen selected={selected} tutor={tutor} messages={messages} draft={draft} working={working} setDraft={setDraft} back={leaveTextConversation} switchToVoice={() => setPage('voice')} startAssessment={beginAssessment} chat={chat} cancel={cancelReply} />);
  if (page === 'voice') addLayer('voice', <Voice skill={selected} tutor={tutor || catalogTutors[0] || tutorsForCountry(profile.country)[0]} learningSession={learningSession} ensureLearningSession={ensureLearningSession} resetLearningSession={() => setLearningSession(undefined)} messages={messages} setMessages={setMessages} onFlame={setFlame} onProposal={async (proposal) => { if (!selected) return; const next = await applyAgentAssessment(selected.name, { ...proposal, assessedAt: new Date().toISOString(), tutor: 'OpenAI Realtime' }); setSkills(next); setSelected(next.find((item) => item.name === selected.name)); notify('Passeport mis à jour', `${selected.name} passe au niveau ${proposal.level}.`); }} back={() => setPage('home')} draft={draft} setDraft={setDraft} working={working} chat={chat} notify={notify} />);

  return view(<View style={s.flex}><View style={s.flex}>{renderHome()}</View>{layers}</View>);
}

/*
  const regionalTutors = tutorsForCountry(profile.country);
  const displayedSkills = searchSkills(skills, skillSearch, true);
  return view(<HomeContent profile={profile} tutor={tutor} tutors={regionalTutors} skills={displayedSkills} selected={selected} flame={flame} wallet={wallet} openWallet={openWallet} selectTutor={setTutor} saveMode={async (mode) => { const next = await saveAgentMode(profile, mode); setProfile(next); notify(`Mode ${mode === 'text' ? 'texte' : 'vocal'} activé`); }} openProfile={() => setPage('profile')} openSearch={() => setSkillSearchOpen(true)} addSkill={() => setPage('skill')} selectSkill={(skill) => { setSelected(skill); notify(`${skill.name} sélectionnée`); }} toggleHidden={async (skill) => { const next = await setSkillHidden(skill.id, !skill.isHidden); setSkills(next); setSelected(next.find((item) => item.id === skill.id)); notify(skill.isHidden ? 'Compétence affichée' : 'Compétence masquée'); }} removeSkill={(skill) => Alert.alert('Supprimer cette compétence ?', `${skill.name} sera retirée de ce passeport.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { const next = await removeSkill(skill.id); setSkills(next); if (selected?.id === skill.id) setSelected(next[0]); notify('Compétence supprimée'); } }])} startConversation={() => { setSelected(selected || skills[0]); setMessages([]); setPage(profile.agentMode); }} />);
  return view(<SafeAreaView style={s.screen} edges={['top', 'bottom']}><View style={s.bar}><Image source={require('../assets/koxmos-logo.png')} style={s.logoImage} accessibilityLabel="Koxmos" /><View style={s.headerActions}><IconButton label="Voir mon temps" onPress={openWallet}><Wallet size={20} color="#111827" /></IconButton><Pressable accessibilityRole="button" onPress={() => setPage('transfer')} style={s.textAction}><Text style={s.textActionLabel}>TRANSFÉRER</Text></Pressable></View></View><ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}><Text style={s.kicker}>PASSEPORT LOCAL</Text><Text style={s.title}>Bonjour, {profile.firstName}.</Text><View style={s.metricRow}><View style={s.flameCard}><Flame size={30} color="#D97706" fill="#F59E0B" /><View><Text style={s.flameCount}>{flame}</Text><Text style={s.flameLabel}>flammes</Text></View></View><Pressable accessibilityRole="button" style={s.walletCard} onPress={openWallet}><Text style={s.skillName}>Temps restant</Text><View style={s.cardAction}><Text style={s.cardActionText}>{wallet ? formatRemainingTime(wallet.creditSeconds) : 'Chargement…'}</Text><ArrowRight size={14} color="#4B5563" /></View></Pressable></View><Text style={s.flameRule}>+1 après 1 min de pratique · −1 par jour manqué</Text><View style={s.modeGroup}><Pressable accessibilityRole="radio" accessibilityState={{ selected: profile.agentMode === 'text' }} onPress={() => saveAgentMode(profile, 'text').then((next) => { setProfile(next); notify('Mode texte activé'); })} style={[s.modeButton, profile.agentMode === 'text' && s.modeButtonActive]}><Text style={[s.modeText, profile.agentMode === 'text' && s.modeTextActive]}>Texte</Text></Pressable><Pressable accessibilityRole="radio" accessibilityState={{ selected: profile.agentMode === 'voice' }} onPress={() => saveAgentMode(profile, 'voice').then((next) => { setProfile(next); notify('Mode vocal activé'); })} style={[s.modeButton, profile.agentMode === 'voice' && s.modeButtonActive]}><Text style={[s.modeText, profile.agentMode === 'voice' && s.modeTextActive]}>Vocal</Text></Pressable></View><Text style={s.sectionTitle}>Choisissez votre tuteur</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tutorRow}>{regionalTutors.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ selected: tutor?.key === item.key }} onPress={() => { setTutor(item); notify(`${item.name} est votre tuteur`); }} style={[s.tutorCard, tutor?.key === item.key && s.tutorSelected]}><Image source={item.avatar} style={s.tutorAvatar} /><Text style={[s.tutorName, tutor?.key === item.key && s.tutorSelectedText]}>{item.name}</Text><Text style={[s.tutorSpecialty, tutor?.key === item.key && s.tutorSelectedText]}>{item.specialty}</Text></Pressable>)}</ScrollView><View style={s.sectionHeader}><Text style={s.sectionTitle}>Mes compétences</Text><View style={s.skillActions}><IconButton label="Rechercher une compétence" onPress={() => setSkillSearchOpen((value) => !value)}><Search size={20} color="#155EEF" /></IconButton><IconButton label="Ajouter une compétence" onPress={() => setPage('skill')}><Plus size={22} color="#155EEF" /></IconButton></View></View>{skillSearchOpen && <TextInput value={skillSearch} onChangeText={setSkillSearch} placeholder="Rechercher une compétence" placeholderTextColor="#6B7280" style={s.input} />}{skills.length === 0 ? <View style={s.emptyState}><Text style={s.skillName}>Votre passeport est prêt.</Text><Text style={s.copy}>Ajoutez votre première compétence pour commencer un échange.</Text><Button title="Ajouter une compétence" onPress={() => setPage('skill')} /></View> : displayedSkills.map((skill) => <View key={skill.id} style={[s.skill, skill.isHidden && s.hiddenSkill, selected?.id === skill.id && s.selected]}><Pressable accessibilityRole="button" style={s.skillContent} onPress={() => { setSelected(skill); notify(`${skill.name} sélectionnée`); }}><Text style={s.skillName}>{skill.name}</Text><Text style={s.skillMeta}>{skill.level} · {skill.source}{skill.assessment ? ` · ${Math.round(skill.assessment.confidence * 100)} %` : ''}</Text></Pressable><IconButton label={skill.isHidden ? `Afficher ${skill.name}` : `Masquer ${skill.name}`} onPress={async () => { const next = await setSkillHidden(skill.id, !skill.isHidden); setSkills(next); setSelected(next.find((item) => item.id === skill.id)); notify(skill.isHidden ? 'Compétence affichée' : 'Compétence masquée'); }}><>{skill.isHidden ? <Eye size={19} color="#374151" /> : <EyeOff size={19} color="#374151" />}</></IconButton><IconButton label={`Supprimer ${skill.name}`} onPress={() => Alert.alert('Supprimer cette compétence ?', `${skill.name} sera retirée de ce passeport.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { const next = await removeSkill(skill.id); setSkills(next); if (selected?.id === skill.id) setSelected(next[0]); notify('Compétence supprimée'); } }])}><Trash2 size={19} color="#B42318" /></IconButton></View>)}{skills.length > 0 && <Button title={profile.agentMode === 'voice' ? 'Démarrer le tuteur vocal' : 'Échanger avec le tuteur'} onPress={() => { setSelected(selected || skills[0]); setMessages([]); setPage(profile.agentMode); }} />}</ScrollView></SafeAreaView>);
}

  */
function HomeContent({ profile, tutor, tutors, skills, selected, flame, wallet, openWallet, openExport, startConversation, selectTutor, openProfile, openSearch, addSkill, selectSkill, toggleHidden, removeSkill }: { profile: LocalProfile; tutor?: Tutor; tutors: Tutor[]; skills: Skill[]; selected?: Skill; flame: number; wallet: WalletData | null; openWallet: () => void; openExport: () => void; startConversation: () => void; selectTutor: (tutor: Tutor) => void; openProfile: () => void; openSearch: () => void; addSkill: () => void; selectSkill: (skill: Skill) => void; toggleHidden: (skill: Skill) => Promise<void>; removeSkill: (skill: Skill) => void }) {
  return <HomeLayout {...{ profile, tutor, tutors, skills, selected, flame, wallet, openWallet, openExport, startConversation, selectTutor, openProfile, openSearch, addSkill, selectSkill, toggleHidden, removeSkill }} />;
  /*
  return <SafeAreaView style={s.screen} edges={['top', 'bottom']}><View style={s.bar}><Image source={require('../assets/koxmos-logo.png')} style={s.logoImage} accessibilityLabel="Koxmos" /><View style={s.headerActions}><IconButton label="Voir mon temps" onPress={openWallet}><Wallet size={20} /></IconButton><IconButton label="Ouvrir mon profil" onPress={openProfile}><UserRound size={20} /></IconButton></View></View><View style={home.root}><ScrollView style={home.scroll} contentContainerStyle={home.content} showsVerticalScrollIndicator={false}><Text style={s.kicker}>PASSEPORT LOCAL</Text><Text style={s.title}>Bonjour, {profile.firstName}.</Text><View style={s.metricRow}><View style={s.flameCard}><Flame size={30} color="#D97706" fill="#F59E0B" /><View><Text style={s.flameCount}>{flame}</Text><Text style={s.flameLabel}>flammes</Text></View></View><Pressable accessibilityRole="button" style={s.walletCard} onPress={openWallet}><Text style={home.remainingLabel}>Temps restant</Text><Text style={home.remainingValue}>{wallet ? formatRemainingTime(wallet.creditSeconds) : '—'}</Text></Pressable></View><Text style={s.flameRule}>+1 après 1 min de pratique · −1 par jour manqué</Text><View style={s.modeGroup}><Pressable accessibilityRole="radio" accessibilityState={{ selected: profile.agentMode === 'text' }} onPress={() => { void saveMode('text'); }} style={[s.modeButton, profile.agentMode === 'text' && s.modeButtonActive]}><Text style={[s.modeText, profile.agentMode === 'text' && s.modeTextActive]}>Texte</Text></Pressable><Pressable accessibilityRole="radio" accessibilityState={{ selected: profile.agentMode === 'voice' }} onPress={() => { void saveMode('voice'); }} style={[s.modeButton, profile.agentMode === 'voice' && s.modeButtonActive]}><Text style={[s.modeText, profile.agentMode === 'voice' && s.modeTextActive]}>Vocal</Text></Pressable></View><Text style={s.sectionTitle}>Choisissez votre tuteur</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tutorRow}>{tutors.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ selected: tutor?.key === item.key }} onPress={() => selectTutor(item)} style={[s.tutorCard, tutor?.key === item.key && s.tutorSelected]}><Image source={item.avatar} style={s.tutorAvatar} /><Text style={[s.tutorName, tutor?.key === item.key && s.tutorSelectedText]}>{item.name}</Text><Text style={[s.tutorSpecialty, tutor?.key === item.key && s.tutorSelectedText]}>{item.specialty}</Text></Pressable>)}</ScrollView><View style={s.sectionHeader}><Text style={s.sectionTitle}>Mes compétences</Text><View style={s.skillActions}><IconButton label="Rechercher une compétence" onPress={openSearch}><Search size={20} /></IconButton><IconButton label="Ajouter une compétence" onPress={addSkill}><Plus size={22} /></IconButton></View></View>{skills.length === 0 ? <View style={s.emptyState}><Text style={s.skillName}>Votre passeport est prêt.</Text><Text style={s.copy}>Ajoutez votre première compétence pour commencer un échange.</Text><Button title="Ajouter une compétence" onPress={addSkill} /></View> : skills.map((skill) => <View key={skill.id} style={[s.skill, skill.isHidden && s.hiddenSkill, selected?.id === skill.id && s.selected]}><Pressable accessibilityRole="button" style={s.skillContent} onPress={() => selectSkill(skill)}><Text style={s.skillName}>{skill.name}</Text><Text style={s.skillMeta}>{skill.level} · {skill.source}{skill.assessment ? ` · ${Math.round(skill.assessment.confidence * 100)} %` : ''}</Text></Pressable><IconButton label={skill.isHidden ? `Afficher ${skill.name}` : `Masquer ${skill.name}`} onPress={() => { void toggleHidden(skill); }}><>{skill.isHidden ? <Eye size={19} color="#374151" /> : <EyeOff size={19} color="#374151" />}</></IconButton><IconButton label={`Supprimer ${skill.name}`} onPress={() => removeSkill(skill)}><Trash2 size={19} /></IconButton></View>)}</ScrollView>{skills.length > 0 && <View style={home.footer}><Button title="Démarrer une conversation" onPress={startConversation} /></View>}</View></SafeAreaView>;
  */
}

function HomeLayout(props: Parameters<typeof HomeContent>[0]) {
  const { profile, tutor, tutors, skills, selected, flame, wallet, openWallet, openExport, startConversation, selectTutor, openProfile, openSearch, addSkill, selectSkill, toggleHidden, removeSkill } = props;
  const { locale, tr } = useCopy();
  return <SafeAreaView style={s.screen} edges={['top', 'bottom']}><View style={s.bar}><Image source={require('../assets/koxmos-logo.png')} style={s.logoImage} accessibilityLabel="Koxmos" /><View style={s.headerActions}><IconButton label={tr('openProfile')} onPress={openProfile}><UserRound size={20} /></IconButton></View></View><View style={home.root}><ScrollView style={home.scroll} contentContainerStyle={home.content} showsVerticalScrollIndicator={false}><Text style={s.title}>{tr('hello', { name: profile.firstName })}</Text><View style={s.metricRow}><View style={[s.metricCard, s.flameCard]}><Text style={s.metricValue}>{flame}</Text><View style={s.metricFooter}><View style={[s.metricIcon, s.flameIcon]}><Flame size={19} color="#B45309" fill="#F59E0B" /></View><Text style={s.metricLabel}>{tr('flames')}</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel={tr('viewCredits')} style={[s.metricCard, s.walletCard]} onPress={openWallet}><Text style={s.metricValue}>{wallet ? formatMetricValue(wallet.balanceCredits, locale) : '—'}</Text><View style={s.metricFooter}><View style={[s.metricIcon, s.walletIcon]}><Wallet size={19} color="#0B63CE" /></View><Text style={s.metricLabel}>{tr('wallet')}</Text><View style={s.metricAdd}><Plus size={17} color="#FFFFFF" strokeWidth={2.5} /></View></View></Pressable></View><Text style={s.flameRule}>{tr('flameRule')}</Text><Text style={s.sectionTitle}>{tr('chooseTutor')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tutorRow}>{tutors.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ selected: tutor?.key === item.key }} onPress={() => selectTutor(item)} style={[s.tutorCard, tutor?.key === item.key && s.tutorSelected]}><Image source={item.avatar} style={s.tutorAvatar} /><Text style={[s.tutorName, tutor?.key === item.key && s.tutorSelectedText]}>{item.name}</Text><Text style={[s.tutorPersona, tutor?.key === item.key && s.tutorSelectedText]}>{item.persona}</Text></Pressable>)}</ScrollView><View style={s.sectionHeader}><Text style={s.sectionTitle}>{tr('skills', { count: skills.length, plural: plural(locale, skills.length) })}</Text><View style={s.skillActions}><IconButton label={tr('searchSkill')} onPress={openSearch}><Search size={20} /></IconButton><IconButton label={tr('downloadSkills')} onPress={openExport}><Download size={20} /></IconButton><IconButton label={tr('addSkill')} onPress={addSkill}><Plus size={22} /></IconButton></View></View>{skills.length === 0 ? <View style={s.emptyState}><Text style={s.skillName}>{tr('skillReady')}</Text><Text style={s.copy}>{tr('skillReadyCopy')}</Text><Button title={tr('addSkill')} onPress={addSkill} /></View> : skills.map((skill) => <SkillCard key={skill.id} skill={skill} selected={selected?.id === skill.id} onSelect={selectSkill} onToggleHidden={toggleHidden} onRemove={removeSkill} />)}</ScrollView></View>{tutor && selected && <View style={home.footer}><Pressable accessibilityRole="button" onPress={startConversation} style={home.startConversationButton}><Text style={home.startConversationText}>{tr('startConversation')}</Text><ArrowRight size={21} color="#FFFFFF" /></Pressable></View>}</SafeAreaView>;
}

function SkillCard({ skill, selected, onSelect, onToggleHidden, onRemove }: { skill: Skill; selected: boolean; onSelect: (skill: Skill) => void; onToggleHidden: (skill: Skill) => Promise<void>; onRemove: (skill: Skill) => void }) {
  const { locale, tr } = useCopy();
  const level = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'].indexOf(skill.level) + 1;
  const updated = new Date(skill.updatedAt).toLocaleDateString(dateLocale(locale), { day: '2-digit', month: 'short', year: 'numeric' });
  return <View style={[s.skill, skill.isHidden && s.hiddenSkill, selected && s.selected]}><Pressable accessibilityRole="button" style={s.skillContent} onPress={() => onSelect(skill)}><View style={home.skillTitleRow}><Text style={s.skillName}>{skill.name}</Text>{skill.source === 'inferred' && <View style={home.skillCheck}><Check size={10} color="#FFFFFF" strokeWidth={3} /></View>}</View><View style={home.levelSteps} accessibilityLabel={tr('level', { level })}>{[1, 2, 3, 4].map((step) => <View key={step} style={[home.levelStep, step <= level && home.levelStepOn]} />)}</View><Text style={home.skillUpdated}>{tr('updated', { date: updated })}</Text></Pressable><IconButton label={skill.isHidden ? tr('showSkill', { name: skill.name }) : tr('hideSkill', { name: skill.name })} onPress={() => { void onToggleHidden(skill); }}><>{skill.isHidden ? <Eye size={19} color="#374151" /> : <EyeOff size={19} color="#374151" />}</></IconButton><IconButton label={tr('deleteSkill', { name: skill.name })} onPress={() => onRemove(skill)} color="#B42318"><Trash2 size={19} /></IconButton></View>;
}

function mergeLiveTranscript(current: string, incoming: string) {
  const next = incoming.trim(); if (!current) return next;
  const previous = current.trim(); const previousLower = previous.toLowerCase(); const nextLower = next.toLowerCase();
  if (previousLower === nextLower || previousLower.includes(nextLower)) return previous;
  if (nextLower.includes(previousLower)) return next;
  const previousWords: string[] = previousLower.match(/[\p{L}\p{N}']+/gu) || [];
  const nextWords: string[] = nextLower.match(/[\p{L}\p{N}']+/gu) || [];
  const shared = previousWords.filter((word) => nextWords.includes(word)).length;
  if (next.length >= previous.length && previousWords.length > 2 && shared / previousWords.length >= .7) return next;
  for (let length = Math.min(previous.length, next.length); length >= 4; length -= 1) if (previousLower.endsWith(nextLower.slice(0, length))) return `${previous}${next.slice(length)}`;
  return `${previous} ${next}`;
}

function LoadingReply({ tutor, dark }: { tutor?: Tutor; dark: boolean }) {
  const opacity = useRef(new Animated.Value(.32)).current;
  useEffect(() => { const animation = Animated.loop(Animated.sequence([Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(opacity, { toValue: .32, duration: 700, useNativeDriver: true })])); animation.start(); return () => animation.stop(); }, [opacity]);
  return <View style={[canvas.message, canvas.tutor, dark && canvas.darkMessage]}><Text style={[canvas.label, dark && canvas.darkLabel]}>{(tutor?.name || 'TUTEUR').toUpperCase()}</Text><Animated.View style={[canvas.loadingLine, { opacity }]} /><Animated.View style={[canvas.loadingLine, canvas.loadingLineShort, { opacity }]} /></View>;
}

function ConversationCanvas({ messages, tutor, dark = false }: { messages: Message[]; tutor?: Tutor; dark?: boolean }) {
  const { tr } = useCopy();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true })); return () => cancelAnimationFrame(frame); }, [messages]);
  return <ScrollView ref={scroll} style={[canvas.scroll, dark && canvas.voiceScroll]} contentContainerStyle={[canvas.content, dark && canvas.voiceContent]} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{messages.map((message, index) => message.role === 'tuteur' && !message.text ? <LoadingReply key={`${index}-loading`} tutor={tutor} dark={dark} /> : <View key={`${index}-${message.text}`} style={[canvas.message, message.role === 'talent' ? canvas.talent : canvas.tutor, dark && canvas.darkMessage, dark && message.role === 'talent' && canvas.darkTalent]}><Text style={[canvas.label, dark && canvas.darkLabel, dark && message.role === 'talent' && canvas.darkTalentText]}>{message.role === 'talent' ? tr('you') : (tutor?.name || tr('tutorFallback')).toUpperCase()}</Text><Text style={[canvas.text, dark && canvas.darkText, dark && message.role === 'talent' && canvas.darkTalentText]}>{message.text}</Text></View>)}</ScrollView>;
}

function ChatScreen({ selected, tutor, messages, draft, working, setDraft, back, switchToVoice, startAssessment, chat, cancel }: { selected?: Skill; tutor?: Tutor; messages: Message[]; draft: string; working: boolean; setDraft: (value: string) => void; back: () => void; switchToVoice: () => void; startAssessment: () => void; chat: () => void; cancel: () => void }) {
  const { tr } = useCopy();
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (!working) return; const animation = Animated.loop(Animated.sequence([Animated.timing(shimmer, { toValue: 1, duration: 850, useNativeDriver: true }), Animated.timing(shimmer, { toValue: 0, duration: 850, useNativeDriver: true })])); animation.start(); return () => animation.stop(); }, [shimmer, working]);
  return <SafeAreaView style={s.screen} edges={['top', 'bottom']}><StatusBar style="dark" /><View style={s.bar}><IconButton label={tr('back')} onPress={back}><ArrowLeft size={22} color="#111827" /></IconButton><View style={s.chatTitle}><Text style={s.barTitle}>{tutor?.name || tr('tutorFallback')}</Text><Text style={s.chatContext}>{selected?.name || tr('skillFallback')}</Text></View><IconButton label={tr('switchVoice')} onPress={switchToVoice}><LucideMic size={21} color="#111827" /></IconButton></View><KeyboardAvoidingView style={s.flex} behavior={Platform.select({ ios: 'padding', android: 'height' })} keyboardVerticalOffset={8}><View style={s.chatHeader}><Text style={s.kicker}>{tr('learningCanvas')}</Text><Text style={s.copy}>{tr('sharedConversation')}</Text></View><ConversationCanvas messages={messages} tutor={tutor} />{working && <Pressable accessibilityRole="button" accessibilityLabel={tr('stopReply')} onPress={cancel} style={s.thinking}><ActivityIndicator size="small" color="#111827" /><Text style={s.shimmerLabel}>{tr('replyInProgress')}</Text></Pressable>}<View style={s.composer}>{!selected?.evaluation?.active && <Pressable accessibilityRole="button" onPress={startAssessment} style={s.assessButton}><Text style={s.assessText}>{tr('assessment')}</Text></Pressable>}{selected?.evaluation?.active && <Text style={s.assessText}>{tr('assessmentProgress', { question: selected.evaluation.questionCount, success: selected.evaluation.consecutiveSuccesses })}</Text>}<View style={s.composerRow}><TextInput value={draft} onChangeText={setDraft} placeholder={tr('writeTo', { name: tutor?.name || tr('tutorFallback') })} placeholderTextColor="#6B7280" multiline style={s.composerInput} /><Pressable accessibilityRole="button" accessibilityLabel={tr('send')} onPress={chat} style={[s.sendButton, (!draft.trim() || working) && s.sendButtonInactive]} disabled={!draft.trim() || working}><ArrowUp color="#22C55E" size={21} strokeWidth={2.8} /></Pressable></View></View></KeyboardAvoidingView></SafeAreaView>;
}

function SkillSearchScreen({ skills, query, onQueryChange, select, back }: { skills: Skill[]; query: string; onQueryChange: (value: string) => void; select: (skill: Skill) => void; back: () => void }) {
  const { tr } = useCopy();
  const offset = useRef(new Animated.Value(-32)).current;
  useEffect(() => { Animated.timing(offset, { toValue: 0, duration: 220, useNativeDriver: true }).start(); }, [offset]);
  const results = searchSkills(skills, query, true);
  return <SafeAreaView style={s.screen} edges={['top', 'bottom']}><Animated.View style={[s.flex, { opacity: offset.interpolate({ inputRange: [-32, 0], outputRange: [.2, 1] }), transform: [{ translateX: offset }] }]}><View style={s.bar}><IconButton label={tr('back')} onPress={back}><ArrowLeft size={22} color="#111827" /></IconButton><Text style={s.barTitle}>{tr('search')}</Text><View style={s.barSpacer} /></View><View style={s.searchPage}><View style={s.searchField}><Search size={20} color="#6B7280" /><TextInput autoFocus value={query} onChangeText={onQueryChange} placeholder={tr('searchSkill')} placeholderTextColor="#6B7280" style={s.searchInput} /></View><ScrollView contentContainerStyle={s.searchResults} keyboardShouldPersistTaps="handled">{results.length ? results.map((skill) => <Pressable key={skill.id} accessibilityRole="button" onPress={() => select(skill)} style={[s.searchResult, skill.isHidden && s.hiddenSkill]}><View><Text style={s.skillName}>{skill.name}</Text><Text style={s.skillMeta}>{skill.level} · {skill.isHidden ? tr('hidden') : tr('visible')}</Text></View><ArrowRight size={18} color="#4B5563" /></Pressable>) : <Text style={s.copy}>{tr('noSkill')}</Text>}</ScrollView></View></Animated.View></SafeAreaView>;
}

function Voice({ skill, tutor, learningSession, ensureLearningSession, resetLearningSession, messages, setMessages, onFlame, onProposal, back, draft, setDraft, working, chat, notify }: { skill?: Skill; tutor: Tutor; learningSession?: LearningSession; ensureLearningSession: () => Promise<LearningSession | undefined>; resetLearningSession: () => void; messages: Message[]; setMessages: React.Dispatch<React.SetStateAction<Message[]>>; onFlame: (value: number) => void; onProposal: (proposal: { level: 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert'; confidence: number; evidence: string; nextExercise?: string }) => Promise<void>; back: () => void; draft: string; setDraft: (value: string) => void; working: boolean; chat: () => void; notify: (title: string, message?: string, tone?: 'success' | 'info') => void }) {
  const [session, setSession] = useState<{ id: string; charged: number } | null>(null); const [call, setCall] = useState<{ close: () => Promise<{ proposal?: { level: 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert'; confidence: number; evidence: string; nextExercise?: string } }> } | null>(null); const [state, setState] = useState('Prêt'); const [levels, setLevels] = useState({ talent: 0, agent: 0 });
  const [textMode, setTextMode] = useState(false);
  const notifyRef = useRef(notify); notifyRef.current = notify;
  const sessionRef = useRef(session); sessionRef.current = session;
  const callRef = useRef(call); callRef.current = call;
  useEffect(() => { const id = session?.id; if (!id) return; const timer = setInterval(() => heartbeatVoiceSession(id).then(async (result) => { setSession({ id, charged: result.chargedFcfa }); if (result.exhausted) { await call?.close(); setState('Solde épuisé'); setSession(null); setCall(null); notifyRef.current('Solde épuisé', 'Rechargez votre temps pour poursuivre.', 'info'); } }).catch(() => setState('Connexion interrompue')), 5000); return () => clearInterval(timer); }, [session?.id, call]);
  useEffect(() => () => { const activeSession = sessionRef.current; const activeCall = callRef.current; if (!activeSession) return; void (async () => { await activeCall?.close().catch(() => undefined); await endVoiceSession(activeSession.id).catch(() => undefined); })(); }, []);
  async function toggle(silent = false) {
    if (!session) {
      let billingId: string | undefined;
      try {
        const activeLearning = learningSession || await ensureLearningSession();
        if (!activeLearning) return;
        const billing = await startVoiceSession(skill?.name || 'Compétence');
        billingId = billing.id;
        const realtime = await startRealtimeConversation({
          billingSessionId: billing.id, learningSessionId: activeLearning.id, country: tutor.countries[0], tutor: tutor.key,
          resume: messages.length > 0, level: skill?.level || 'Débutant', summary: compactConversation(messages) || activeLearning.summary || skill?.assessment?.evidence,
          onRemoteStream: () => setState(`${tutor.name} parle`), onStatus: (status) => setState(`OpenAI : ${status}`), onAudioLevel: setLevels,
          onTranscript: (turn) => { const event = { role: turn.speaker === 'agent' ? 'tuteur' as const : 'talent' as const, text: turn.text, mode: 'voice' as const }; setMessages((previous) => { const last = previous.at(-1); if (last?.role !== event.role) return [...previous, { role: event.role, text: event.text }]; return [...previous.slice(0, -1), { ...last, text: mergeLiveTranscript(last.text, event.text) }]; }); },
        });
        setCall(realtime); setSession({ id: billing.id, charged: 0 }); setState('Tuteur connecté');
      } catch (error) { if (billingId) await endVoiceSession(billingId).catch(() => undefined); if (error instanceof AgentRequestError && error.status === 404) resetLearningSession(); notify('Session vocale indisponible', error instanceof Error ? error.message : 'Réessayez dans un instant.', 'info'); }
      return;
    }
    const activeSession = session;
    try {
      const closeResult = await call?.close().catch(() => undefined);
      if (closeResult?.proposal) await onProposal(closeResult.proposal);
      const result = await endVoiceSession(activeSession.id);
      if (result.durationSeconds >= 60) { const practice = await recordPractice(result.durationSeconds); onFlame(practice.flame); if (practice.rewarded) notify('Flamme gagnée', 'Une minute de pratique validée : +1 flamme.'); }
      if (!silent) { const consumedCredits = result.chargedFcfa / 100; setState(`Terminée : ${consumedCredits.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} crédits`); notify('Conversation terminée', `${consumedCredits.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} crédit${consumedCredits === 1 ? '' : 's'} consommé${consumedCredits === 1 ? '' : 's'}.`); }
    } finally { setSession(null); setCall(null); setLevels({ talent: 0, agent: 0 }); }
  }
  async function leaveVoice() { if (session) await toggle(); back(); }
  async function changeAgent() { if (textMode) { setTextMode(false); await toggle(true); return; } if (session) await toggle(true); setState('Mode texte'); setTextMode(true); }
  return <VoiceLayout skill={skill} tutor={tutor} messages={messages} agentAudioLevel={levels.agent} textMode={textMode} draft={draft} setDraft={setDraft} working={working} chat={chat} active={Boolean(session)} toggle={() => { void toggle(); }} leave={() => { void leaveVoice(); }} switchAgent={() => { void changeAgent(); }} />;
  /*
  const active = Math.max(levels.talent, levels.agent);
  return <SafeAreaView style={s.liveScreen} edges={['top', 'bottom']}><StatusBar style="light" /><View style={s.liveBar}><IconButton label="Retour" onPress={() => { void leaveVoice(); }} dark><ArrowLeft color="#fff" size={22} /></IconButton><Image source={require('../assets/koxmos-logo.png')} style={s.logoImage} /><Text style={s.liveCost}>{session ? `${session.charged.toFixed(2)} FCFA` : '100 FCFA / min'}</Text></View><ScrollView contentContainerStyle={s.liveBody} showsVerticalScrollIndicator={false}><View style={s.liveTutor}><View style={[s.voiceRing, { transform: [{ scale: 1 + levels.agent * .14 }], opacity: .25 + levels.agent * .75 }]} /><Image source={tutor.avatar} style={s.liveAvatar} /><Text style={s.liveTutorName}>{tutor.name}</Text><View style={s.liveStatusRow}><Circle size={8} fill="#59E391" color="#59E391" /><Text style={s.liveStatus}>{state}</Text></View></View><View style={s.liveConversation}><Text style={s.liveQuestion}>{skill?.name || 'Votre compétence'}</Text><Text style={s.liveHint}>Prenez votre temps. L’échange est en direct et n’est pas enregistré.</Text><View style={s.transcript}>{turns.length ? turns.map((turn, index) => <View key={`${index}-${turn.text}`} style={[s.turn, turn.role === 'talent' ? s.talentTurn : s.agentTurn]}><Text style={s.turnSpeaker}>{turn.role === 'talent' ? 'VOUS' : tutor.name.toUpperCase()}</Text><Text style={s.turnText}>{turn.text}</Text></View>) : <Text style={s.liveHint}>La transcription éphémère apparaîtra ici pendant l’échange.</Text>}</View><View style={s.wave}>{Array.from({ length: 13 }, (_, index) => <View key={index} style={[s.waveBar, { height: 7 + active * (18 + (index % 4) * 7), opacity: .45 + active * .55 }]} />)}</View></View><Pressable accessibilityRole="button" onPress={toggle} style={[s.liveButton, session && s.endButton]}><Mic color={session ? '#fff' : '#000'} /><Text style={[s.liveButtonText, session && s.endButtonText]}>{session ? 'Terminer la session' : 'Démarrer avec le tuteur'}</Text></Pressable></ScrollView></SafeAreaView>;
  */
}

function VoiceLayout({ tutor, messages, agentAudioLevel, textMode, draft, setDraft, working, chat, active, toggle, leave, switchAgent }: { skill?: Skill; tutor: Tutor; messages: Message[]; agentAudioLevel: number; textMode: boolean; draft: string; setDraft: (value: string) => void; working: boolean; chat: () => void; active: boolean; toggle: () => void; leave: () => void; switchAgent: () => void }) {
  const { tr } = useCopy();
  const audioLevel = Math.max(0, Math.min(1, agentAudioLevel || 0));
  const sendDisabled = !draft.trim() || working;
  return <SafeAreaView style={voice.screen} edges={['top', 'bottom']}><StatusBar style="light" /><KeyboardAvoidingView style={voice.screen} behavior={Platform.select({ ios: 'padding', android: 'height' })}><View style={[voice.body, textMode && voice.bodyText]}><View style={voice.tutor}><View style={voice.avatarWrap}><View style={[voice.avatarRing, { opacity: .28 + audioLevel * .64, transform: [{ scale: 1 + audioLevel * .12 }] }]} /><Image source={tutor.avatar} style={voice.avatar} /></View></View><View style={voice.conversation}><ConversationCanvas messages={messages} tutor={tutor} dark /></View></View>{textMode ? <View style={voice.textDock}><View style={voice.chatFormInline}><TextInput value={draft} onChangeText={setDraft} placeholder={tr('writeTo', { name: tutor.name })} placeholderTextColor="#737373" multiline style={voice.chatInput} /><Pressable accessibilityRole="button" accessibilityLabel={tr('send')} disabled={sendDisabled} onPress={chat} style={[voice.sendButton, sendDisabled && voice.sendButtonDisabled]}><ArrowUp size={21} strokeWidth={2.8} /></Pressable></View><View style={voice.textFooter}><Pressable accessibilityRole="button" accessibilityLabel={tr('close')} onPress={leave} style={voice.closeButton}><X size={22} color="#FFFFFF" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr('switchVoice')} onPress={switchAgent} style={voice.muteButton}><AudioLines size={23} color="#FFFFFF" /></Pressable></View></View> : <View style={voice.footer}><Pressable accessibilityRole="button" accessibilityLabel={tr('close')} onPress={leave} style={voice.closeButton}><X size={22} color="#FFFFFF" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={active ? tr('end') : tr('start')} onPress={toggle} style={[voice.callButton, active && voice.callButtonActive]}><LucideMic size={22} color={active ? '#FFFFFF' : '#000000'} /><Text style={[voice.callButtonText, active && voice.callButtonTextActive]}>{active ? tr('end') : tr('start')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr('textTutor')} onPress={switchAgent} style={voice.muteButton}><TextAlignStart size={23} color="#FFFFFF" /></Pressable></View>}</KeyboardAvoidingView></SafeAreaView>;
}

function Screen({ title, back, children }: { title: string; back: () => void; children: React.ReactNode }) {
  const { tr } = useCopy();
  const swipeOffset = useRef(new Animated.Value(0)).current;
  const returning = useRef(false);
  const resetSwipe = () => { Animated.spring(swipeOffset, { toValue: 0, useNativeDriver: true, friction: 8 }).start(); };
  const swipeBack = useRef(PanResponder.create({ onMoveShouldSetPanResponder: (_event, gesture) => !returning.current && gesture.dx > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25, onPanResponderMove: (_event, gesture) => swipeOffset.setValue(Math.max(0, gesture.dx)), onPanResponderRelease: (_event, gesture) => { if (gesture.dx > 90 && gesture.vx > 0.15 && !returning.current) { returning.current = true; Animated.timing(swipeOffset, { toValue: 420, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) back(); else { returning.current = false; resetSwipe(); } }); } else resetSwipe(); }, onPanResponderTerminate: resetSwipe })).current;
  return <Animated.View style={[s.flex, { transform: [{ translateX: swipeOffset }] }]} {...swipeBack.panHandlers}><SafeAreaView style={s.screen} edges={['top', 'bottom']}><View style={s.bar}><IconButton label={tr('back')} onPress={back}><ArrowLeft size={22} color="#111827" /></IconButton><Text style={s.barTitle}>{title}</Text><View style={s.barSpacer} /></View><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView></SafeAreaView></Animated.View>;
}
function Center({ children }: { children: React.ReactNode }) { return <SafeAreaView style={[s.screen, s.center]} edges={['top', 'bottom']}><ScrollView contentContainerStyle={[s.body, s.centerBody]} keyboardShouldPersistTaps="handled">{children}</ScrollView></SafeAreaView>; }
function CountrySelect({ value, open, onOpen, onClose, onChange }: { value: string; open: boolean; onOpen: () => void; onClose: () => void; onChange: (value: string) => void }) {
  const { tr } = useCopy();
  const selected = value in MARKETS ? value as keyof typeof MARKETS : 'CI';
  return <View style={s.countrySelectWrap}><Text style={s.countryLabel}>{tr('country')}</Text><Pressable accessibilityRole="button" accessibilityLabel={tr('country')} onPress={onOpen} style={s.countrySelect}><View style={s.countryValue}><Text style={s.countryFlag}>{MARKET_FLAGS[selected]}</Text><Text style={s.countrySelectText}>{MARKETS[selected].name}</Text></View><ChevronDown size={19} color="#111827" /></Pressable><Modal visible={open} transparent animationType="slide" onRequestClose={onClose}><View style={s.countryModal}><Pressable style={s.countryBackdrop} onPress={onClose} /><View style={s.countrySheet}><View style={s.sheetHandle} /><View style={s.countrySheetHeader}><View><Text style={s.countrySheetTitle}>{tr('country')}</Text><Text style={s.countrySheetSubtitle}>{tr('countryPickCopy')}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={tr('close')} onPress={onClose} style={s.countryCloseButton}><X size={19} color="#111827" /></Pressable></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.countryOptions}>{marketCodes.map((code) => <Pressable key={code} accessibilityRole="radio" accessibilityState={{ selected: code === selected }} onPress={() => { onChange(code); onClose(); }} style={[s.countryOption, code === selected && s.countryOptionSelected]}><View style={s.countryValue}><Text style={s.countryFlag}>{MARKET_FLAGS[code]}</Text><Text style={s.countryOptionText}>{MARKETS[code].name}</Text></View>{code === selected && <View style={s.countryCheck}><Check size={14} color="#FFFFFF" strokeWidth={3} /></View>}</Pressable>)}</ScrollView></View></View></Modal></View>;
}
function ConversationHistoryScreen({ back }: { back: () => void }) {
  const [items, setItems] = useState<ConversationHistory[]>([]);
  const [selected, setSelected] = useState<ConversationHistory>();
  const refresh = () => { void loadConversationHistory().then(setItems); };
  useEffect(refresh, []);
  if (selected) return <Screen title="Conversation" back={() => setSelected(undefined)}><Text style={s.kicker}>{selected.tutor.toUpperCase()} · {selected.skill}</Text><Text style={s.copy}>{new Date(selected.updatedAt).toLocaleString('fr-FR')}</Text><ConversationCanvas messages={selected.messages} tutor={{ name: selected.tutor } as Tutor} /><Pressable accessibilityRole="button" style={s.dangerButton} onPress={() => Alert.alert('Supprimer cette conversation ?', 'Cette transcription sera effacée uniquement de ce téléphone.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => { void deleteConversationHistory(selected.id).then(() => { setSelected(undefined); refresh(); }); } }])}><Trash2 size={18} color="#8B1E1E" /><Text style={s.dangerButtonText}>Supprimer cette conversation</Text></Pressable></Screen>;
  return <Screen title="Historique des conversations" back={back}><Text style={s.copy}>Ces transcriptions sont conservées uniquement sur cet appareil.</Text>{items.length === 0 ? <View style={s.emptyState}><Text style={s.skillName}>Aucune conversation enregistrée.</Text></View> : <><Pressable accessibilityRole="button" style={s.dangerButton} onPress={() => Alert.alert('Tout supprimer ?', 'Toutes les transcriptions locales seront effacées. Cette action est irréversible.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Tout supprimer', style: 'destructive', onPress: () => { void clearConversationHistory().then(() => setItems([])); } }])}><Trash2 size={18} color="#8B1E1E" /><Text style={s.dangerButtonText}>Tout supprimer</Text></Pressable>{items.map((item) => <View key={item.id} style={s.skill}><Pressable accessibilityRole="button" style={s.skillContent} onPress={() => setSelected(item)}><Text style={s.skillName}>{item.tutor} · {item.skill}</Text><Text style={s.skillMeta}>{new Date(item.updatedAt).toLocaleString('fr-FR')} · {item.messages.length} messages</Text><Text style={s.copy} numberOfLines={2}>{item.messages.at(-1)?.text}</Text></Pressable><IconButton label={`Supprimer la conversation avec ${item.tutor}`} onPress={() => Alert.alert('Supprimer cette conversation ?', 'Cette transcription sera effacée uniquement de ce téléphone.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => { void deleteConversationHistory(item.id).then(refresh); } }])}><Trash2 size={19} color="#B42318" /></IconButton></View>)}</>}</Screen>;
}

function ProfileScreen({ openDetails, openHistory, openBilling, back }: { openDetails: () => void; openHistory: () => void; openBilling: () => void; back: () => void }) {
  const { tr } = useCopy();
  const swipeOffset = useRef(new Animated.Value(0)).current;
  const returning = useRef(false);
  const resetSwipe = () => { Animated.spring(swipeOffset, { toValue: 0, useNativeDriver: true, friction: 8 }).start(); };
  const swipeBack = useRef(PanResponder.create({ onMoveShouldSetPanResponder: (_event, gesture) => !returning.current && gesture.dx > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25, onPanResponderMove: (_event, gesture) => swipeOffset.setValue(Math.max(0, gesture.dx)), onPanResponderRelease: (_event, gesture) => { if (gesture.dx > 90 && gesture.vx > 0.15 && !returning.current) { returning.current = true; Animated.timing(swipeOffset, { toValue: 420, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) back(); else { returning.current = false; resetSwipe(); } }); } else resetSwipe(); }, onPanResponderTerminate: resetSwipe })).current;
  return <Animated.View style={[s.flex, { transform: [{ translateX: swipeOffset }] }]} {...swipeBack.panHandlers}><SafeAreaView style={s.screen} edges={['top', 'bottom']}><View style={s.profileBar}><IconButton label={tr('back')} onPress={back}><ArrowLeft size={28} color="#111827" /></IconButton><Text style={s.profileBarTitle}>{tr('profile')}</Text><View style={s.barSpacer} /></View><View style={s.profileMenu}><Pressable accessibilityRole="button" onPress={openDetails} style={s.profileMenuItem}><Text style={s.profileMenuText}>{tr('profile')}</Text><ArrowRight size={23} color="#111827" /></Pressable><Pressable accessibilityRole="button" onPress={openHistory} style={s.profileMenuItem}><Text style={s.profileMenuText}>{tr('conversations')}</Text><ArrowRight size={23} color="#111827" /></Pressable><Pressable accessibilityRole="button" onPress={openBilling} style={s.profileMenuItem}><Text style={s.profileMenuText}>{tr('billing')}</Text><ArrowRight size={23} color="#111827" /></Pressable></View><View style={s.profileSignature}><Text style={s.profileSignatureText}>{tr('signature')}</Text></View></SafeAreaView></Animated.View>;
}

function ProfileDetailsScreen({ profile, save, deletePassport, back }: { profile: LocalProfile; save: (name: string, country: string, saveConversationHistory: boolean) => Promise<void>; deletePassport: () => Promise<void>; back: () => void }) {
  const { tr } = useCopy();
  const [name, setName] = useState(profile.firstName);
  const [country, setCountry] = useState(profile.country);
  const [saveConversationHistory, setSaveConversationHistory] = useState(profile.saveConversationHistory);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const swipeOffset = useRef(new Animated.Value(0)).current;
  const returning = useRef(false);
  const resetSwipe = () => { Animated.spring(swipeOffset, { toValue: 0, useNativeDriver: true, friction: 8 }).start(); };
  const swipeBack = useRef(PanResponder.create({ onMoveShouldSetPanResponder: (_event, gesture) => !returning.current && gesture.dx > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25, onPanResponderMove: (_event, gesture) => swipeOffset.setValue(Math.max(0, gesture.dx)), onPanResponderRelease: (_event, gesture) => { if (gesture.dx > 90 && gesture.vx > 0.15 && !returning.current) { returning.current = true; Animated.timing(swipeOffset, { toValue: 420, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) back(); else { returning.current = false; resetSwipe(); } }); } else resetSwipe(); }, onPanResponderTerminate: resetSwipe })).current;
  const saveProfile = async () => { setSaving(true); try { await save(name, country, saveConversationHistory); } catch (error) { Alert.alert(tr('profileError'), error instanceof Error ? error.message : tr('saveUnavailable')); } finally { setSaving(false); } };
  const confirmDelete = () => Alert.alert(tr('deletePassportTitle'), tr('deletePassportCopy'), [{ text: tr('cancel'), style: 'cancel' }, { text: tr('delete'), style: 'destructive', onPress: () => { setDeleting(true); void deletePassport().catch((error) => { setDeleting(false); Alert.alert(tr('deleteUnavailable'), error instanceof Error ? error.message : tr('retry')); }); } }]);
  return <Animated.View style={[s.flex, { transform: [{ translateX: swipeOffset }] }]} {...swipeBack.panHandlers}><SafeAreaView style={s.screen} edges={['top', 'bottom']}><View style={s.profileBar}><IconButton label={tr('back')} onPress={back}><ArrowLeft size={28} color="#111827" /></IconButton><Text style={s.profileBarTitle}>{tr('profile')}</Text><View style={s.barSpacer} /></View><ScrollView contentContainerStyle={s.profileBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><TextInput value={name} maxLength={FIRST_NAME_MAX_LENGTH} onChangeText={setName} placeholder={tr('firstName')} placeholderTextColor="#6B7280" autoCapitalize="words" style={s.profileInput} /><CountrySelect value={country} open={countryPickerOpen} onOpen={() => setCountryPickerOpen(true)} onClose={() => setCountryPickerOpen(false)} onChange={setCountry} /><View style={s.preferenceRow}><View style={s.preferenceCopy}><Text style={s.preferenceTitle}>{tr('saveHistory')}</Text><Text style={s.copy}>{tr('saveHistoryCopy')}</Text></View><Switch value={saveConversationHistory} onValueChange={setSaveConversationHistory} trackColor={{ false: '#D1D5DB', true: '#111827' }} /></View><Pressable accessibilityRole="button" disabled={saving || deleting} onPress={saveProfile} style={[s.profilePrimaryButton, (saving || deleting) && s.buttonDisabled]}><Text style={s.profilePrimaryButtonText}>{saving ? tr('saving') : tr('saveProfile')}</Text><Save size={23} color="#FFFFFF" /></Pressable><View style={s.profileDanger}><Pressable accessibilityRole="button" disabled={deleting} style={[s.profileDeleteButton, deleting && s.buttonDisabled]} onPress={confirmDelete}><Trash2 size={24} color="#A11D1D" strokeWidth={2.5} /><Text style={s.profileDeleteButtonText}>{deleting ? tr('deleting') : tr('deletePassport')}</Text></Pressable></View></ScrollView></SafeAreaView></Animated.View>;
}
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, disabled && s.buttonDisabled]}><Text style={s.buttonText}>{title}</Text><ArrowRight color="#fff" size={18} /></Pressable>; }
function IconButton({ label, onPress, children, dark = false, color }: { label: string; onPress: () => void; children: React.ReactNode; dark?: boolean; color?: string }) { const icon = React.isValidElement<{ color?: string }>(children) && children.type !== React.Fragment ? React.cloneElement(children, { color: color || (dark ? '#fff' : '#111827') }) : children; return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={[s.iconButton, dark && s.iconButtonDark]}>{icon}</Pressable>; }
function Toast({ notice, dismiss }: { notice: Notice; dismiss: () => void }) { const insets = useSafeAreaInsets(); if (!notice) return null; return <View pointerEvents="box-none" style={[s.toastOverlay, { paddingTop: insets.top + 10 }]}><View accessibilityLiveRegion="polite" style={[s.toast, notice.tone === 'info' && s.toastInfo]}><View style={s.toastIcon}><Check size={16} color="#fff" /></View><View style={s.toastCopy}><Text style={s.toastTitle}>{notice.title}</Text>{notice.message && <Text style={s.toastMessage}>{notice.message}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="Fermer la notification" onPress={dismiss} hitSlop={8}><X size={18} color="#fff" /></Pressable></View></View>; }

const canvas = StyleSheet.create({
  scroll: { flex: 1 }, voiceScroll: {}, content: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 18, gap: 16 }, voiceContent: { paddingBottom: 18 }, loadingLine: { height: 9, width: 118, borderRadius: 5, backgroundColor: '#9CA3AF' }, loadingLineShort: { width: 72, marginTop: 2 },
  empty: { color: '#6B7280', fontSize: 18, lineHeight: 27, textAlign: 'center', marginVertical: 'auto' }, darkEmpty: { color: '#D4D4D4' },
  message: { maxWidth: '88%', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 15, gap: 7 }, tutor: { alignSelf: 'flex-start', backgroundColor: '#F3F4F6' }, talent: { alignSelf: 'flex-end', backgroundColor: '#111827' }, darkMessage: { backgroundColor: '#1C1C1C', borderWidth: 1, borderColor: '#353535' }, darkTalent: { backgroundColor: '#FFFFFF' },
  label: { color: '#6B7280', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textAlign: 'left' }, darkLabel: { color: '#A3A3A3' },
  text: { color: '#111827', fontSize: 20, lineHeight: 29, fontWeight: '600', textAlign: 'left' }, darkText: { color: '#FFFFFF' }, darkTalentText: { color: '#111827' },
});

const voice = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  body: { flex: 1, paddingTop: 26, paddingBottom: 104, gap: 12 }, bodyText: { paddingBottom: 8 },
  tutor: { alignItems: 'center', paddingTop: 6, paddingHorizontal: 20 },
  avatarWrap: { width: 126, height: 126, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarRing: { position: 'absolute', width: 142, height: 142, borderRadius: 71, borderWidth: 1, borderColor: '#166534' },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  kicker: { color: '#A3A3A3', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  name: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -1.5, marginTop: 5 }, status: { color: '#A3A3A3', fontSize: 13, marginTop: 5 },
  conversation: { flex: 1, minHeight: 0 },
  question: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', letterSpacing: -1, lineHeight: 31, textAlign: 'center', marginTop: 10 },
  hint: { color: '#D4D4D4', lineHeight: 21, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  transcript: { minHeight: 140, gap: 16 },
  turn: { maxWidth: '88%' },
  turnTalent: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  turnTutor: { alignSelf: 'flex-start' },
  turnSpeaker: { color: '#A3A3A3', fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginBottom: 4 },
  turnText: { color: '#FFFFFF', fontSize: 17, lineHeight: 24 },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 34, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  closeButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(220, 38, 38, 0.45)' },
  muteButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#262626' },
  textButtonActive: { backgroundColor: '#155EEF' }, callButton: { minHeight: 58, borderRadius: 29, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF' }, callButtonActive: { backgroundColor: '#B42318' }, callButtonText: { color: '#000000', fontWeight: '800' }, callButtonTextActive: { color: '#FFFFFF' },
  chatForm: { position: 'absolute', left: 20, right: 20, bottom: 104, minHeight: 58, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, borderRadius: 29, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000000', shadowOpacity: .28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }, chatFormInline: { minHeight: 58, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, borderRadius: 29, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000000', shadowOpacity: .28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }, textDock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12, backgroundColor: '#000000' }, textFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  chatInput: { flex: 1, maxHeight: 96, color: '#111827', fontSize: 16, paddingVertical: 9 },
  sendButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  sendButtonDisabled: { opacity: .45 },
  button: { flex: 1, minHeight: 66, borderRadius: 33, backgroundColor: '#FFFFFF', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: '#000000', shadowOpacity: .32, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  buttonText: { color: '#000000', fontWeight: '800' },
  endButton: { backgroundColor: '#8F1D1D' },
});

const home = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 108, gap: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  startConversationButton: { minHeight: 56, borderRadius: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111827' },
  startConversationText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  remainingLabel: { position: 'absolute', left: 14, bottom: 14, color: '#6B7280', fontSize: 12, fontWeight: '700' },
  remainingValue: { position: 'absolute', left: 14, top: 14, color: '#111827', fontSize: 24, lineHeight: 29, fontWeight: '800' },
  skillTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  skillCheck: { width: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#155EEF' },
  levelSteps: { flexDirection: 'row', gap: 5, marginTop: 10 },
  levelStep: { width: 24, height: 6, borderRadius: 3, backgroundColor: '#D1FAE5' },
  levelStepOn: { backgroundColor: '#16A34A' },
  skillUpdated: { color: '#6B7280', fontSize: 11, marginTop: 8 },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, flex: { flex: 1 }, pageOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 2 }, center: { justifyContent: 'center' }, centerBody: { justifyContent: 'center', minHeight: '100%' }, body: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 16, flexGrow: 1 },
  bar: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#D1D5DB', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, barTitle: { color: '#111827', fontWeight: '800', fontSize: 20, letterSpacing: -.45 }, barSpacer: { width: 44 }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 }, iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 }, iconButtonDark: { backgroundColor: '#1F2937' }, textAction: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }, textActionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: .8, color: '#111827' }, logoImage: { width: 36, height: 36, borderRadius: 10 }, addAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4 },
  kicker: { color: '#374151', fontWeight: '800', letterSpacing: 1.05, fontSize: 11 }, title: { color: '#111827', fontSize: 36, lineHeight: 41, fontWeight: '800', letterSpacing: -1.4 }, copy: { color: '#4B5563', fontSize: 15, lineHeight: 22 }, input: { width: '100%', color: '#111827', borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52, fontSize: 16, backgroundColor: '#fff' }, tall: { minHeight: 144, textAlignVertical: 'top' }, countrySelectWrap: { width: '100%', gap: 7 }, countryLabel: { color: '#374151', fontSize: 13, fontWeight: '700' }, countrySelect: { minHeight: 56, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 14, paddingHorizontal: 15, backgroundColor: '#F9FAFB', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, countryValue: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }, countryFlag: { fontSize: 20 }, countrySelectText: { color: '#111827', fontSize: 16, fontWeight: '700', flexShrink: 1 }, countryModal: { flex: 1, justifyContent: 'flex-end' }, countryBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,.42)' }, countrySheet: { maxHeight: '76%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 28, paddingTop: 10 }, sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginBottom: 14 }, countrySheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 16 }, countrySheetTitle: { color: '#111827', fontSize: 20, fontWeight: '800', letterSpacing: -.35 }, countrySheetSubtitle: { color: '#6B7280', fontSize: 13, marginTop: 3 }, countryCloseButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }, countryOptions: { gap: 8, paddingBottom: 6 }, countryOption: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, backgroundColor: '#fff' }, countryOptionSelected: { borderColor: '#111827', backgroundColor: '#F9FAFB' }, countryOptionText: { color: '#111827', fontSize: 16, fontWeight: '700' }, countryCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  button: { width: '100%', minHeight: 52, borderRadius: 14, backgroundColor: '#111827', paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, buttonDisabled: { opacity: .45 }, buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, chip: { minHeight: 44, borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 22, paddingHorizontal: 14, justifyContent: 'center' }, chipOn: { borderColor: '#111827', backgroundColor: '#111827' }, chipText: { color: '#374151', fontWeight: '700' }, on: { color: '#fff' },
  metricRow: { flexDirection: 'row', gap: 12 }, metricCard: { flex: 1, minHeight: 102, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, padding: 14, justifyContent: 'flex-start' }, metricFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }, metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, flameCard: { flex: .84, backgroundColor: '#FFFBEB' }, flameIcon: { backgroundColor: '#FEF3C7' }, walletCard: { flex: 1.16, backgroundColor: '#F8FAFC' }, walletIcon: { backgroundColor: '#EFF6FF' }, metricAdd: { width: 30, height: 30, marginLeft: 'auto', borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }, metricLabel: { flex: 1, color: '#6B7280', fontSize: 12, lineHeight: 16, fontWeight: '700' }, metricValue: { marginLeft: 8, color: '#111827', fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -.5 }, flameCount: { color: '#111827', fontSize: 24, fontWeight: '800' }, flameLabel: { color: '#6B7280', fontSize: 12 }, cardAction: { flexDirection: 'row', alignItems: 'center', gap: 4 }, cardActionText: { color: '#4B5563', fontSize: 13 }, flameRule: { color: '#6B7280', fontSize: 12, marginTop: -8 }, modeGroup: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: '#F3F4F6' }, modeButton: { flex: 1, minHeight: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, modeButtonActive: { backgroundColor: '#111827' }, modeText: { color: '#4B5563', fontWeight: '800' }, modeTextActive: { color: '#fff' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }, sectionTitle: { color: '#111827', fontWeight: '800', fontSize: 19, letterSpacing: -.35 }, skillActions: { flexDirection: 'row', alignItems: 'center', gap: 2 }, tutorRow: { gap: 12, paddingVertical: 2, paddingRight: 4 }, tutorCard: { width: 164, minHeight: 166, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, padding: 14, backgroundColor: '#fff' }, tutorSelected: { borderColor: '#111827', backgroundColor: '#111827' }, tutorAvatar: { width: 58, height: 58, borderRadius: 29, marginBottom: 14 }, tutorName: { color: '#111827', fontWeight: '800', fontSize: 16 }, tutorPersona: { marginTop: 4, color: '#6B7280', fontSize: 12, lineHeight: 17 }, tutorSelectedText: { color: '#fff' },
  emptyState: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#9CA3AF', borderRadius: 16, padding: 18, gap: 10, backgroundColor: '#F9FAFB' }, skill: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingLeft: 16, paddingRight: 6, paddingVertical: 8, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8 }, selected: { borderColor: '#111827', backgroundColor: '#F9FAFB' }, hiddenSkill: { opacity: .56 }, skillContent: { flex: 1, minHeight: 52, justifyContent: 'center' }, skillName: { color: '#111827', fontWeight: '800', fontSize: 16 }, skillMeta: { color: '#6B7280', marginTop: 4, fontSize: 13 },
  rechargeList: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 14, overflow: 'hidden' }, rechargePlan: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D5DB' }, price: { marginLeft: 'auto', color: '#374151', fontWeight: '700' }, notice: { padding: 14, borderRadius: 12, backgroundColor: '#EFF6FF', color: '#1E3A8A', fontSize: 13, lineHeight: 19 }, profileExport: { gap: 10, marginTop: 12, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' }, dangerTitle: { color: '#8B1E1E', fontSize: 16, fontWeight: '800' }, dangerButton: { minHeight: 48, borderWidth: 1, borderColor: '#E6A7A1', borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#FFFFFF' }, dangerButtonText: { color: '#8B1E1E', fontWeight: '800', fontSize: 14 },
  profileBar: { minHeight: 74, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, profileBarTitle: { color: '#111827', fontSize: 20, fontWeight: '800', letterSpacing: -.45 }, profileMenu: { paddingHorizontal: 20, paddingTop: 28, gap: 12 }, profileMenuItem: { minHeight: 64, paddingHorizontal: 18, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, profileMenuText: { color: '#111827', fontSize: 17, fontWeight: '800', letterSpacing: -.2 }, profileSignature: { marginTop: 'auto', marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, profileSignatureText: { color: '#6B7280', fontSize: 12, fontWeight: '600' }, profileBody: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 52, gap: 20, flexGrow: 1 }, profileInput: { width: '100%', minHeight: 58, color: '#111827', borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 13, fontSize: 18, backgroundColor: '#FFFFFF' }, profilePrimaryButton: { minHeight: 58, borderRadius: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111827' }, profilePrimaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -.2 }, profileConversations: { marginTop: 8, paddingTop: 24, gap: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' }, profileBilling: { gap: 15, marginTop: 8 }, profileSectionTitle: { color: '#111827', fontSize: 22, fontWeight: '800', letterSpacing: -.65 }, profileDanger: { marginTop: 12 }, profileDeleteButton: { minHeight: 58, borderWidth: 1, borderColor: '#E6A7A1', borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#FFFFFF' }, profileDeleteButtonText: { color: '#A11D1D', fontWeight: '800', fontSize: 17, letterSpacing: -.2 },
  preferenceRow: { minHeight: 84, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }, preferenceCopy: { flex: 1, gap: 4 }, preferenceTitle: { color: '#111827', fontSize: 16, fontWeight: '800' },
  chatTitle: { flex: 1, alignItems: 'center', gap: 1 }, chatContext: { color: '#6B7280', fontSize: 11, fontWeight: '700' }, chatHeader: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB', gap: 4 }, messages: { flex: 1 }, messagesContent: { padding: 20, gap: 10, flexGrow: 1, justifyContent: 'flex-end' }, emptyConversation: { alignSelf: 'center', color: '#6B7280', textAlign: 'center', lineHeight: 21, maxWidth: 280, marginBottom: 'auto', marginTop: 40 }, message: { maxWidth: '88%', padding: 13, borderRadius: 16, gap: 4 }, theirs: { alignSelf: 'flex-start', backgroundColor: '#F3F4F6', borderBottomLeftRadius: 4 }, mine: { alignSelf: 'flex-end', backgroundColor: '#111827', borderBottomRightRadius: 4 }, messageLabel: { color: '#6B7280', fontSize: 10, fontWeight: '800', letterSpacing: .8 }, messageText: { color: '#111827', fontSize: 15, lineHeight: 21 }, mineText: { color: '#fff' }, shimmerCard: { minWidth: 200, gap: 9 }, shimmerLine: { height: 10, borderRadius: 5, backgroundColor: '#D1D5DB', width: 188 }, shimmerShort: { width: 116 }, shimmerLabel: { color: '#6B7280', fontSize: 12, marginTop: 2 }, thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, composer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB', gap: 8, backgroundColor: '#fff' }, composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, composerInput: { flex: 1, minHeight: 48, maxHeight: 112, borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, color: '#111827', fontSize: 16, textAlignVertical: 'top' }, sendButton: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' }, sendButtonInactive: { backgroundColor: '#E5E7EB' }, assessButton: { alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 9, backgroundColor: '#EFF6FF' }, assessText: { color: '#1D4ED8', fontSize: 13, fontWeight: '800' },
  searchPage: { flex: 1, padding: 20, gap: 16 }, searchField: { minHeight: 52, borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchInput: { flex: 1, color: '#111827', fontSize: 16, minHeight: 50 }, searchResults: { gap: 10, paddingBottom: 28 }, searchResult: { minHeight: 72, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveScreen: { flex: 1, backgroundColor: '#111827' }, liveBar: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#374151' }, liveCost: { color: '#F9FAFB', fontSize: 12, fontWeight: '800' }, liveBody: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, gap: 26 }, liveTutor: { minHeight: 210, justifyContent: 'center', alignItems: 'center', position: 'relative' }, voiceRing: { width: 150, height: 150, position: 'absolute', borderRadius: 75, borderWidth: 1, borderColor: '#59E391', shadowColor: '#59E391', shadowOpacity: .85, shadowRadius: 20 }, liveAvatar: { width: 128, height: 128, borderRadius: 64, marginBottom: 16 }, liveKicker: { color: '#9CA3AF', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, liveTutorName: { color: '#fff', fontSize: 31, fontWeight: '800', letterSpacing: -1.5, marginTop: 5 }, liveStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }, liveStatus: { color: '#59E391', fontSize: 12, fontWeight: '700' }, liveConversation: { gap: 14 }, liveQuestion: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1.5, lineHeight: 39 }, liveHint: { color: '#D1D5DB', lineHeight: 20 }, transcript: { minHeight: 130, maxHeight: 280, gap: 16 }, turn: { maxWidth: '88%' }, talentTurn: { alignSelf: 'flex-end', alignItems: 'flex-end' }, agentTurn: { alignSelf: 'flex-start' }, turnSpeaker: { color: '#9CA3AF', fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginBottom: 4 }, turnText: { color: '#fff', fontSize: 17, lineHeight: 24 }, wave: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 5 }, waveBar: { width: 4, borderRadius: 4, backgroundColor: '#fff' }, liveButton: { minHeight: 58, borderRadius: 29, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }, liveButtonText: { color: '#111827', fontWeight: '800' }, endButton: { backgroundColor: '#D92D20' }, endButtonText: { color: '#fff' },
  toastOverlay: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 }, toast: { width: '100%', maxWidth: 520, minHeight: 58, padding: 12, borderRadius: 15, backgroundColor: '#067647', flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: .18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 }, toastInfo: { backgroundColor: '#175CD3' }, toastIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }, toastCopy: { flex: 1, gap: 2 }, toastTitle: { color: '#fff', fontWeight: '800', fontSize: 14 }, toastMessage: { color: '#fff', fontSize: 12, lineHeight: 16, opacity: .94 },
});
