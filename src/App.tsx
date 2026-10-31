import { useEffect, useState, type FormEvent } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  UserRound,
  RefreshCw,
  ChevronDown,
  DoorOpen,
  Eye,
  KeyRound,
  Moon,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';

type SaveData = {
  unlockedThrough: number;
  activeChapter: number;
  foundPhoto: boolean;
  foundKey: boolean;
  journal: string[];
  solvedLibrary: boolean;
  completedChapters: number[];
  cluesByChapter: Record<string, number[]>;
};
type HouseLayer = 'present' | 'memory' | 'reflection';
const layerDescriptions: Record<HouseLayer, string> = {
  present: 'PHYSICAL RECORD — the room as it claims to be. Solid objects, locks, dates, and marks are visible here.',
  memory: 'TEMPORAL ECHO — the room as it remembers itself. Repeated events and forgotten timestamps emerge here.',
  reflection: 'MIRRORED ARCHITECTURE — the room as it hides itself. Impossible geometry and absent doors can be read here.',
};
const clueLayerOrder: HouseLayer[] = ['present', 'memory', 'reflection'];
const chapters = [
  {
    title: 'The Invitation',
    subtitle: 'PROLOGUE',
    description:
      'A letter. A brass key. A house that should have remained sealed.',
    objective:
      'Inspect the photograph, collect the brass key, and examine the front door.',
  },
  {
    title: 'The Silent Library',
    subtitle: 'NIGHT 01',
    description: 'Books recount events that have not happened yet.',
    objective: 'Arrange the catalogue words in the correct order.',
  },
  {
    title: 'The Room That Remembers',
    subtitle: 'NIGHT 02',
    description: 'The bedroom changes whenever you turn away.',
  },
  {
    title: 'The Overgrown Garden',
    subtitle: 'NIGHT 03',
    description: 'Something is growing where no light can reach.',
  },
  {
    title: 'Beneath the Foundation',
    subtitle: 'NIGHT 04',
    description: 'The plans show a room beneath the foundations.',
  },
  {
    title: 'The Unfinished Evening',
    subtitle: 'NIGHT 05',
    description: 'The ballroom is ready for guests who never arrived.',
  },
  {
    title: 'The Seventh Room',
    subtitle: 'NIGHT 06',
    description: 'The room has been hidden in different places.',
  },
  {
    title: 'The House Is Awake',
    subtitle: 'NIGHT 07',
    description: 'The house has been waiting for you to remember.',
  },
];
const storageKey = 'hollow-house-seven-nights-save-v1';

const HOUSE_VAULT_KEY = 'hollow-house-seven-nights-encrypted-vault-v1';
const HOUSE_VAULT_PERSON = 'The Archivist';
const HOUSE_VAULT_ITERATIONS = 600000;
type HouseVaultEnvelope = {
  format: 'hollow-house-encrypted-vault';
  version: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};
function houseVaultToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}
function houseVaultFromBase64(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function houseVaultAad(envelope: Pick<HouseVaultEnvelope, 'format' | 'version' | 'kdf' | 'iterations' | 'salt'>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    format: envelope.format, version: envelope.version, kdf: envelope.kdf,
    iterations: envelope.iterations, salt: envelope.salt,
  }));
}
function parseHouseVaultEnvelope(value: unknown): HouseVaultEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This is not a Hollow House encrypted vault backup.');
  const envelope = value as Partial<HouseVaultEnvelope>;
  if (envelope.format !== 'hollow-house-encrypted-vault' || envelope.version !== 1 ||
      envelope.kdf !== 'PBKDF2-SHA-256' || !Number.isInteger(envelope.iterations) ||
      (envelope.iterations as number) < 100000 || (envelope.iterations as number) > 1000000 ||
      typeof envelope.salt !== 'string' || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new Error('The encrypted vault format is unsupported or incomplete.');
  }
  const salt = houseVaultFromBase64(envelope.salt);
  const iv = houseVaultFromBase64(envelope.iv);
  const ciphertext = houseVaultFromBase64(envelope.ciphertext);
  if (salt.length < 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('The encrypted vault file is incomplete.');
  return envelope as HouseVaultEnvelope;
}
async function deriveHouseVaultKey(passphrase: string, salt: Uint8Array, iterations = HOUSE_VAULT_ITERATIONS): Promise<CryptoKey> {
  if (!window.crypto?.subtle) throw new Error('This browser does not support the required encryption. Use an up-to-date browser over HTTPS.');
  const material = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encryptHouseVaultSnapshot(saveData: SaveData, passphrase: string): Promise<HouseVaultEnvelope> {
  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const salt = houseVaultToBase64(saltBytes);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const metadata = {
    format: 'hollow-house-encrypted-vault' as const,
    version: 1 as const,
    kdf: 'PBKDF2-SHA-256' as const,
    iterations: HOUSE_VAULT_ITERATIONS,
    salt,
    iv: houseVaultToBase64(iv),
  };
  const key = await deriveHouseVaultKey(passphrase, saltBytes);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: houseVaultAad(metadata) },
    key, new TextEncoder().encode(JSON.stringify({ format: 'hollow-house-save', version: 1, saveData }))
  );
  return { ...metadata, ciphertext: houseVaultToBase64(new Uint8Array(ciphertext)) };
}
async function decryptHouseVaultSnapshot(value: unknown, passphrase: string): Promise<{ envelope: HouseVaultEnvelope; saveData: SaveData }> {
  const envelope = parseHouseVaultEnvelope(value);
  const key = await deriveHouseVaultKey(passphrase, houseVaultFromBase64(envelope.salt), envelope.iterations);
  let payload: any;
  try {
    const plain = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: houseVaultFromBase64(envelope.iv), additionalData: houseVaultAad(envelope) },
      key, houseVaultFromBase64(envelope.ciphertext)
    );
    payload = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('Incorrect passphrase, or encrypted vault authentication failed.');
  }
  if (!payload || payload.format !== 'hollow-house-save' || payload.version !== 1 ||
      !payload.saveData || typeof payload.saveData !== 'object' ||
      !Array.isArray(payload.saveData.journal) || !Array.isArray(payload.saveData.completedChapters) ||
      !payload.saveData.cluesByChapter || typeof payload.saveData.cluesByChapter !== 'object') {
    throw new Error('The decrypted file is not a valid Hollow House save.');
  }
  return { envelope, saveData: normalizeSaveData(payload.saveData) };
}

const supabase = createClient(
  'https://airnozaixgvzmuzhqdoh.supabase.co',
  'sb_publishable_eGBpX2QUYunUCQ-9JJDm2Q_zfduHUKq',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
const blankSave: SaveData = {
  unlockedThrough: 0,
  activeChapter: 0,
  foundPhoto: false,
  foundKey: false,
  journal: [],
  solvedLibrary: false,
  completedChapters: [],
  cluesByChapter: {},
};
const words = ['MEMORY', 'HOUSE', 'NAME', 'RETURN'];
type NightPuzzle = {
  location: string;
  clues: [string, string, string];
  clueDetails: [string, string, string];
  question: string;
  answers: string[];
  solution: string;
  solutionText: string;
};
const nightPuzzles: Record<number, NightPuzzle> = {
  2: {
    location: 'THE BEDROOM THAT REMEMBERS',
    clues: ['Back of the photograph', 'Stopped clock', 'Mirror inscription'],
    clueDetails: [
      'The photograph is dated 1961. A pencilled note calls it the first memory.',
      'The bedside clock stopped at 6:01, the same minute written on the frame.',
      'The mirror etching repeats the date: 1961. The room is remembering a year, not a person.',
    ],
    question: 'Which year appears in all three clues?',
    answers: ['1999', '1961', '1906', 'SEVEN'],
    solution: '1961',
    solutionText: 'The bedroom released its memory: 1961. The mirror now reflects an ordinary room, except for one open door.',
  },
  3: {
    location: 'THE OVERGROWN GARDEN',
    clues: ['Moss-covered sundial', 'Stone birds', 'Dry fountain',],
    clueDetails: [
      'The sundial’s shadow points toward the first light of morning.',
      'All three stone birds face the same direction: toward the east wall.',
      'Inside the fountain is a line: “Where the day begins, the roots let go.”',
    ],
    question: 'Which direction releases the garden mechanism?',
    answers: ['NORTH', 'WEST', 'EAST', 'SOUTH'],
    solution: 'EAST',
    solutionText: 'The fountain drained toward the east. Beneath the roots, a brass plate bears the outline of the house’s foundation.',
  },
  4: {
    location: 'BENEATH THE FOUNDATION',
    clues: ['Foundation blueprint', 'Valve markings', 'Scratched arrow'],
    clueDetails: [
      'The old blueprint marks the sealed chamber north of the central support.',
      'Only the north valve is stamped with seven short lines.',
      'A scratched arrow points north, followed by the words: “Not down. Through.”',
    ],
    question: 'Which direction aligns the hidden passage?',
    answers: ['SOUTH', 'EAST', 'NORTH', 'WEST'],
    solution: 'NORTH',
    solutionText: 'The north valve opened. The hidden passage is real, but its measurements cannot fit beneath the house above.',
  },
  5: {
    location: 'THE UNFINISHED EVENING',
    clues: ['Stopped gramophone', 'Guest seating card', 'Silent bell'],
    clueDetails: [
      'The gramophone’s label reads: “Play this before anyone enters the floor.”',
      'The seating card orders the evening: music first, dancing second, the bell last.',
      'The ballroom bell has no clapper. It rings only when the record begins.',
    ],
    question: 'What must begin the evening’s sequence?',
    answers: ['THE BELL', 'MUSIC', 'THE DANCE', 'SILENCE'],
    solution: 'MUSIC',
    solutionText: 'The record played without a needle. The ballroom replayed an evening that no guest remembers attending.',
  },
  6: {
    location: 'THE SEVENTH ROOM',
    clues: ['Seven-door sketch', 'Key with seven cuts', 'Negative photograph'],
    clueDetails: [
      'The sketch shows six visible doors and one empty outline behind the wall.',
      'The brass key’s seven cuts match seven marks on the hidden doorframe.',
      'The negative reveals a doorway where the original photograph shows only a blank wall.',
    ],
    question: 'Which room does the evidence reveal?',
    answers: ['THE FIRST', 'THE SIXTH', 'THE SEVENTH', 'THE ATTIC'],
    solution: 'THE SEVENTH',
    solutionText: 'The seventh room appeared between two walls that had always touched. Every object inside is familiar, but none is yours.',
  },
  7: {
    location: 'THE HOUSE IS AWAKE',
    clues: ['Portrait with closed eyes', 'Key inscription', 'Sealed ledger'],
    clueDetails: [
      'Every portrait has closed eyes except the one that resembles you.',
      'The key now reads: “A door opens when its name is remembered.”',
      'The ledger has one final line left blank, waiting for a word rather than a date.',
    ],
    question: 'What word restores the house’s final memory?',
    answers: ['FORGET', 'RETURN', 'REMEMBER', 'LEAVE'],
    solution: 'REMEMBER',
    solutionText: 'The final word was REMEMBER. The house releases the people and memories it kept; the front door opens into dawn.',
  },
};
function getPreviewChapter(): number | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('preview');
  if (value === null || value.trim() === '') return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < chapters.length ? index : null;
}
function normalizeSaveData(parsed: Partial<SaveData> | null | undefined): SaveData {
  if (!parsed || typeof parsed !== 'object') return { ...blankSave };
  return {
    ...blankSave,
    ...parsed,
    unlockedThrough: Math.max(
      0,
      Math.min(7, Number(parsed.unlockedThrough) || 0)
    ),
    activeChapter: Math.max(
      0,
      Math.min(7, Number(parsed.activeChapter) || 0)
    ),
    journal: Array.isArray(parsed.journal)
      ? parsed.journal.filter((x): x is string => typeof x === 'string')
      : [],
    completedChapters: Array.isArray(parsed.completedChapters)
      ? parsed.completedChapters.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 7)
      : [],
    cluesByChapter: parsed.cluesByChapter && typeof parsed.cluesByChapter === 'object'
      ? parsed.cluesByChapter
      : {},
  };
}
function accountStorageKey(userId: string): string {
  return storageKey + ':user:' + userId;
}
function loadSave(key = storageKey): SaveData {
  try {
    const value = localStorage.getItem(key);
    if (!value) return { ...blankSave };
    return normalizeSaveData(JSON.parse(value) as Partial<SaveData>);
  } catch {
    return { ...blankSave };
  }
}
function HouseMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 43 50 12 88 43V88H12V43Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M26 88V48L50 29 74 48V88M43 88V65Q50 54 57 65V88M22 43H78M35 38V49M50 31V43M65 38V49"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="50" cy="57" r="2" fill="currentColor" />
    </svg>
  );
}
function App() {
  const previewChapter = getPreviewChapter();
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [saveReady, setSaveReady] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountMode, setAccountMode] = useState<'signin' | 'signup'>('signin');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNotice, setAccountNotice] = useState('');
  const [cloudStatus, setCloudStatus] = useState<'guest' | 'loading' | 'saving' | 'saved' | 'error'>('guest');
  const [save, setSave] = useState<SaveData>(() => {
    const initial = loadSave();
    if (previewChapter === null) return initial;
    return {
      ...initial,
      activeChapter: previewChapter,
      unlockedThrough: 7,
      cluesByChapter: {
        ...initial.cluesByChapter,
        [String(previewChapter)]: [],
      },
    };
  });
  const [screen, setScreen] = useState<
    'home' | 'game' | 'chapters' | 'journal' | 'settings' | 'atlas'
  >(() => previewChapter === null ? 'home' : 'game');
  const [notice, setNotice] = useState('');
  const [intro, setIntro] = useState(() => previewChapter === null);
  const [lightOn, setLightOn] = useState(false);
  const [houseLayer, setHouseLayer] = useState<HouseLayer>('present');
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [subLogoLoaded, setSubLogoLoaded] = useState(false);
  const [atlasImageLoaded, setAtlasImageLoaded] = useState(false);
  const [atlasImageUnavailable, setAtlasImageUnavailable] = useState(false);
  const [doorInspected, setDoorInspected] = useState(false);
  const [mirrorInspected, setMirrorInspected] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [shelf, setShelf] = useState(['HOUSE', 'RETURN', 'MEMORY', 'NAME']);
  const [puzzleChoice, setPuzzleChoice] = useState('');

  const [vaultExists, setVaultExists] = useState(() => {
    try { return Boolean(localStorage.getItem(HOUSE_VAULT_KEY)); } catch { return false; }
  });
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultIdentity, setVaultIdentity] = useState('');
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultConfirm, setVaultConfirm] = useState('');
  const [vaultNotice, setVaultNotice] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);

  const currentPuzzle = nightPuzzles[save.activeChapter];
  const currentClues = save.cluesByChapter[String(save.activeChapter)] || [];
  const currentPuzzleSolved = save.completedChapters.includes(save.activeChapter);
  const houseResponse = currentPuzzleSolved ? 'MEMORY RELEASED' : currentClues.length === 0 ? 'UNOBSERVED' : currentClues.length === 1 ? 'IT NOTICED YOU' : currentClues.length === 2 ? 'PATTERN RECOGNIZED' : 'FOLLOWING YOUR PATTERN';
  const platformLabel = Capacitor.isNativePlatform()
    ? 'CAPACITOR · ' + Capacitor.getPlatform().toUpperCase()
    : 'WEB PREVIEW · CAPACITOR CONFIGURED';

  async function createHouseVault() {
    setVaultNotice('');
    if (vaultPassphrase.length < 12) { setVaultNotice('Use at least 12 characters for the vault passphrase.'); return; }
    if (vaultPassphrase !== vaultConfirm) { setVaultNotice('The passphrases do not match.'); return; }
    setVaultBusy(true);
    try {
      const envelope = await encryptHouseVaultSnapshot(save, vaultPassphrase);
      localStorage.setItem(HOUSE_VAULT_KEY, JSON.stringify(envelope));
      setVaultExists(true);
      setVaultUnlocked(true);
      setVaultConfirm('');
      setVaultNotice('Encrypted snapshot vault created. Your passphrase is not stored.');
    } catch (error) {
      setVaultNotice(error instanceof Error ? error.message : 'Could not create the encrypted vault.');
    } finally { setVaultBusy(false); }
  }
  async function unlockHouseVault() {
    setVaultNotice('');
    if (vaultIdentity.trim().toLowerCase() !== HOUSE_VAULT_PERSON.toLowerCase()) {
      setVaultNotice('Access denied. The assigned keeper identity is The Archivist.');
      return;
    }
    setVaultBusy(true);
    try {
      const raw = localStorage.getItem(HOUSE_VAULT_KEY);
      if (!raw) throw new Error('No encrypted vault exists on this device.');
      await decryptHouseVaultSnapshot(JSON.parse(raw), vaultPassphrase);
      setVaultUnlocked(true);
      setVaultNotice('Access granted to The Archivist for this session.');
    } catch (error) {
      setVaultNotice(error instanceof Error ? error.message : 'Could not unlock the vault.');
    } finally { setVaultBusy(false); }
  }
  async function sealHouseVault() {
    setVaultNotice('');
    if (!vaultUnlocked || !vaultPassphrase) { setVaultNotice('Unlock the vault first.'); return; }
    setVaultBusy(true);
    try {
      const envelope = await encryptHouseVaultSnapshot(save, vaultPassphrase);
      localStorage.setItem(HOUSE_VAULT_KEY, JSON.stringify(envelope));
      setVaultNotice('Current story progress sealed into an encrypted snapshot.');
    } catch (error) {
      setVaultNotice(error instanceof Error ? error.message : 'Could not seal the current progress.');
    } finally { setVaultBusy(false); }
  }
  function exportHouseVault() {
    try {
      if (!vaultUnlocked) throw new Error('Unlock the vault before exporting a backup.');
      const raw = localStorage.getItem(HOUSE_VAULT_KEY);
      if (!raw) throw new Error('Create and seal the vault before exporting.');
      const envelope = parseHouseVaultEnvelope(JSON.parse(raw));
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'hollow-house-encrypted-vault.json';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setVaultNotice('Encrypted backup downloaded. It still requires the passphrase.');
    } catch (error) {
      setVaultNotice(error instanceof Error ? error.message : 'Could not export the encrypted backup.');
    }
  }
  async function importHouseVault(event: { target: HTMLInputElement }) {
    const file = event.target.files?.[0];
    if (!file) return;
    setVaultNotice('');
    try {
      if (!vaultUnlocked || !vaultPassphrase) throw new Error('Unlock the vault before restoring a backup.');
      const imported = await decryptHouseVaultSnapshot(JSON.parse(await file.text()), vaultPassphrase);
      if (!window.confirm('Restore this encrypted Hollow House backup? Current story progress will be replaced.')) return;
      const restored = normalizeSaveData(imported.saveData);
      const key = accountUser ? accountStorageKey(accountUser.id) : storageKey;
      localStorage.setItem(key, JSON.stringify(restored));
      localStorage.setItem(key + ':updated', String(Date.now()));
      setSave(restored);
      localStorage.setItem(HOUSE_VAULT_KEY, JSON.stringify(imported.envelope));
      setVaultNotice('Encrypted backup restored. Story progress has been updated.');
    } catch (error) {
      setVaultNotice(error instanceof Error ? error.message : 'Could not restore the encrypted backup.');
    } finally { event.target.value = ''; }
  }
  function lockHouseVault() {
    setVaultUnlocked(false);
    setVaultPassphrase('');
    setVaultConfirm('');
    setVaultIdentity('');
    setVaultNotice('Vault locked. Re-enter the keeper identity and passphrase to unlock it.');
  }

  const layerSwitcher = (
    <div className="memory-layer-switch" role="group" aria-label="Select a house-memory layer">
      <button type="button" className={'memory-tab present-tab' + (houseLayer === 'present' ? ' active' : '')} aria-pressed={houseLayer === 'present'} onClick={() => setHouseLayer('present')}>
        <span className="mode-index">01</span><DoorOpen size={15} /><span><strong>Present</strong><small>Physical traces</small></span>
      </button>
      <button type="button" className={'memory-tab memory-tab-mode' + (houseLayer === 'memory' ? ' active' : '')} aria-pressed={houseLayer === 'memory'} onClick={() => setHouseLayer('memory')}>
        <span className="mode-index">02</span><Moon size={15} /><span><strong>Memory</strong><small>Temporal echo</small></span>
      </button>
      <button type="button" className={'memory-tab reflection-tab' + (houseLayer === 'reflection' ? ' active' : '')} aria-pressed={houseLayer === 'reflection'} onClick={() => setHouseLayer('reflection')}>
        <span className="mode-index">03</span><Eye size={15} /><span><strong>Reflection</strong><small>Hidden geometry</small></span>
      </button>
    </div>
  );
useEffect(() => {
    let active = true;
    const hydrateAccount = async (user: User | null) => {
      setSaveReady(false);
      setAccountReady(false);
      setAccountUser(user);

      if (!user) {
        setSave(loadSave());
        setCloudStatus('guest');
        setAccountReady(true);
        setSaveReady(true);
        return;
      }

      setCloudStatus('loading');
      try {
        const { data: cloudRow, error } = await supabase
          .from('hollow_house_saves')
          .select('save_data, updated_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        const localKey = accountStorageKey(user.id);
        const localRaw = localStorage.getItem(localKey);
        const localUpdatedAt = Number(localStorage.getItem(localKey + ':updated') || '0');
        const cloudUpdatedAt = cloudRow?.updated_at ? Date.parse(cloudRow.updated_at) : 0;
        let nextSave: SaveData;

        if (cloudRow?.save_data && localRaw && localUpdatedAt > cloudUpdatedAt) {
          nextSave = loadSave(localKey);
        } else if (cloudRow?.save_data) {
          nextSave = normalizeSaveData(cloudRow.save_data as Partial<SaveData>);
        } else if (localRaw) {
          nextSave = loadSave(localKey);
        } else {
          const guestClaimed = localStorage.getItem(storageKey + ':guest-claimed-v1') === 'true';
          const guestRaw = localStorage.getItem(storageKey);
          if (guestRaw && !guestClaimed) {
            nextSave = loadSave(storageKey);
            localStorage.setItem(storageKey + ':guest-claimed-v1', 'true');
            localStorage.removeItem(storageKey);
          } else {
            nextSave = { ...blankSave };
          }
        }

        if (!active) return;
        setSave(nextSave);
        setCloudStatus(cloudRow?.save_data ? 'saved' : 'saving');
        setAccountNotice('');
      } catch (error) {
        if (!active) return;
        setSave(loadSave(accountStorageKey(user.id)));
        setCloudStatus('error');
        setAccountNotice(
          'Signed in, but cloud progress could not be loaded. Your local account copy is preserved.'
        );
      } finally {
        if (active) {
          setAccountReady(true);
          setSaveReady(true);
        }
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAccountNotice('Could not verify the account session. Please sign in again.');
      void hydrateAccount(data.session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED') return;
      window.setTimeout(() => {
        if (active) void hydrateAccount(session?.user ?? null);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!saveReady || previewChapter !== null) return;
    const key = accountUser ? accountStorageKey(accountUser.id) : storageKey;
    try {
      localStorage.setItem(key, JSON.stringify(save));
      localStorage.setItem(key + ':updated', String(Date.now()));
    } catch {
      setNotice('Progress could not be saved. Check this browser’s storage settings.');
    }
  }, [save, previewChapter, accountUser?.id, saveReady]);

  useEffect(() => {
    if (!saveReady || !accountUser || previewChapter !== null) return;
    let active = true;
    const userId = accountUser.id;
    const timer = window.setTimeout(async () => {
      setCloudStatus('saving');
      const { error } = await supabase
        .from('hollow_house_saves')
        .upsert(
          {
            user_id: userId,
            save_data: save,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      if (!active) return;
      if (error) {
        setCloudStatus('error');
        setAccountNotice('Cloud sync failed. Your local copy remains available. Open Account and choose SYNC NOW to retry.');
      } else {
        setCloudStatus('saved');
      }
    }, 700);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [save, accountUser?.id, saveReady, previewChapter]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const addJournal = (entry: string) =>
    setSave(prev =>
      prev.journal.includes(entry)
        ? prev
        : { ...prev, journal: [...prev.journal, entry] }
    );
  const openChapter = (index: number) => {
    if (index > save.unlockedThrough) {
      setNotice(
        'This night is still sealed. Complete the available chapter to continue.'
      );
      return;
    }
    setSave(prev => ({ ...prev, activeChapter: index }));
    setHouseLayer('present');
    setPuzzleChoice('');
    setScreen('game');
    setIntro(true);
  };
  const examinePhoto = () => {
    setSave(prev => ({
      ...prev,
      foundPhoto: true,
      unlockedThrough: prev.foundKey
        ? Math.max(1, prev.unlockedThrough)
        : prev.unlockedThrough,
    }));
    addJournal('A family photograph dated 1961. One figure resembles you.');
    setNotice('Photograph recorded in the journal.');
  };
  const takeKey = () => {
    setSave(prev => ({
      ...prev,
      foundKey: true,
      unlockedThrough: prev.foundPhoto
        ? Math.max(1, prev.unlockedThrough)
        : prev.unlockedThrough,
    }));
    addJournal('A brass key engraved with seven narrow marks.');
    setNotice('Brass key collected.');
  };
  const inspectDoor = () => {
    setDoorInspected(true);
    addJournal(
      'The front door is locked from the outside. Its keyhole has seven narrow notches.'
    );
    setNotice(
      'The door is locked from the outside. Its keyhole has seven narrow notches.'
    );
  };
  const inspectMirror = () => {
    setMirrorInspected(true);
    addJournal(
      'The mirror reflects the entrance hall—but a seventh window appears in the reflection.'
    );
    setNotice('The mirror shows a seventh window. No such window exists here.');
  };
  const solveLibrary = () => {
    if (shelf.join('|') === words.join('|')) {
      setSave(prev => ({
        ...prev,
        solvedLibrary: true,
        unlockedThrough: Math.max(prev.unlockedThrough, 2),
        completedChapters: Array.from(new Set([...prev.completedChapters, 1])),
      }));
      addJournal(
        'The library catalogue reads: MEMORY, HOUSE, NAME, RETURN. The west-wing latch clicks open.'
      );
      setNotice(
        'Correct. The catalogue sequence is now recorded in your journal.'
      );
    } else
      setNotice('The order is wrong. Read the catalogue clue and try again.');
  };
  const inspectNightClue = (clueIndex: number) => {
    const puzzle = nightPuzzles[save.activeChapter];
    if (!puzzle) return;
    const requiredLayer = clueLayerOrder[clueIndex];
    if (houseLayer !== requiredLayer) {
      setNotice('This clue is blurred in ' + houseLayer.toUpperCase() + '. Shift the lens to ' + requiredLayer.toUpperCase() + ' to reveal it.');
      return;
    }
    const clueKey = String(save.activeChapter);
    const detail = puzzle.clueDetails[clueIndex];
    setSave(prev => {
      const found = prev.cluesByChapter[clueKey] || [];
      if (found.includes(clueIndex)) return prev;
      return {
        ...prev,
        cluesByChapter: { ...prev.cluesByChapter, [clueKey]: [...found, clueIndex] },
      };
    });
    addJournal(detail);
    setNotice(detail);
  };
  const solveNightPuzzle = () => {
    const puzzle = nightPuzzles[save.activeChapter];
    if (!puzzle) return;
    if (currentClues.length < 3) {
      setNotice('Inspect all three clues before using the mechanism.');
      return;
    }
    if (puzzleChoice !== puzzle.solution) {
      setNotice('The mechanism remains still. Re-read your journal and reconsider the evidence.');
      return;
    }
    setSave(prev => ({
      ...prev,
      unlockedThrough: Math.max(prev.unlockedThrough, Math.min(7, prev.activeChapter + 1)),
      completedChapters: Array.from(new Set([...prev.completedChapters, prev.activeChapter])),
      journal: prev.journal.includes(puzzle.solutionText)
        ? prev.journal
        : [...prev.journal, puzzle.solutionText],
    }));
    setNotice(save.activeChapter === 7 ? 'The final memory is restored. The front door opens.' : 'Memory recovered. A new part of the house has opened.');
  };
  const resetProgress = () => {
    if (
      !window.confirm(
        'Reset all saved story progress on this browser? This cannot be undone.'
      )
    )
      return;
    setSave(blankSave);
    setShelf(['HOUSE', 'RETURN', 'MEMORY', 'NAME']);
    setHouseLayer('present');
    setPuzzleChoice('');
    setDoorInspected(false);
    setMirrorInspected(false);
    setScreen('home');
    setNotice('Local story progress has been reset.');
  };
  const handleAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = accountEmail.trim();

    if (!email) {
      setAccountNotice('Enter your email address before continuing.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountNotice('Enter a valid email address.');
      return;
    }
    if (!accountPassword) {
      setAccountNotice('Enter your password before continuing.');
      return;
    }
    if (accountMode === 'signup' && accountPassword.length < 8) {
      setAccountNotice('Choose a password with at least 8 characters.');
      return;
    }

    setAccountBusy(true);
    setAccountNotice('');
    try {
      if (accountMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: accountPassword,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setAccountPassword('');
        if (data.session) {
          setAccountNotice('Account created. Loading your private cloud save.');
        } else {
          setAccountMode('signin');
          setAccountNotice('Check your email to confirm the account, then sign in here.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: accountPassword,
        });
        if (error) throw error;
        setAccountPassword('');
        setAccountNotice('Signed in. Loading this account’s separate progress.');
      }
    } catch (error) {
      setAccountNotice(error instanceof Error ? error.message : 'Account request failed. Please try again.');
    } finally {
      setAccountBusy(false);
    }
  };

  const syncCloudSave = async () => {
    if (!accountUser) return;
    setAccountBusy(true);
    setAccountNotice('');
    const { error } = await supabase
      .from('hollow_house_saves')
      .upsert(
        {
          user_id: accountUser.id,
          save_data: save,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    if (error) {
      setCloudStatus('error');
      setAccountNotice('Cloud sync failed. The local account copy remains on this device. Check your connection and retry.');
    } else {
      setCloudStatus('saved');
      setAccountNotice('Cloud save synchronized for ' + (accountUser.email || 'this account') + '.');
    }
    setAccountBusy(false);
  };

  const handleAccountSignOut = async () => {
    if (!accountUser) return;
    setAccountBusy(true);
    setAccountNotice('');
    const { error: saveError } = await supabase
      .from('hollow_house_saves')
      .upsert(
        {
          user_id: accountUser.id,
          save_data: save,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    const { error: signOutError } = await supabase.auth.signOut();
    setAccountBusy(false);
    if (signOutError) {
      setAccountNotice('Sign-out failed. Please try again.');
    } else if (saveError) {
      setCloudStatus('guest');
      setAccountNotice('Signed out. The last cloud sync failed, but this account’s local recovery copy was kept on this device.');
    } else {
      setCloudStatus('guest');
      setAccountNotice('Signed out. Each account keeps its own separate progress.');
    }
  };

  const chapter = chapters[save.activeChapter] || chapters[0];
  return (
    <main
      className={
        'app-shell' +
        (largeText ? ' large-text' : '') +
        (reducedMotion ? ' reduced-motion' : '')
      }
    >
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <button
          className="brand-lockup"
          onClick={() => setScreen('home')}
          aria-label="Return to main menu"
        >
          <span className="brand-mini">
            <img
              className="brand-mini-art"
              src="/resources/hollow-house-sub-logo.png"
              alt=""
              onLoad={() => setSubLogoLoaded(true)}
              onError={event => {
                setSubLogoLoaded(false);
                event.currentTarget.style.display = 'none';
              }}
            />
            {!subLogoLoaded && (
              <span className="brand-mini-fallback" aria-hidden="true">
                <HouseMark />
              </span>
            )}
          </span>
          <span>
            <strong>THE HOLLOW HOUSE</strong>
            <small>SEVEN NIGHTS</small>
          </span>
        </button>
        <div className="top-actions">
          <span className="status-dot" />
          <span className="status-copy beta-pill">DEVELOPER BETA · BUILD 0.1.0</span>
          <button
            className="account-button"
            onClick={() => setScreen('settings')}
            aria-label="Account and cloud saves"
            title="Account and cloud saves"
          >
            {accountUser ? <Cloud size={14} /> : <LogIn size={14} />}
            <span>{!accountReady ? 'CHECKING' : accountUser ? 'ACCOUNT' : 'SIGN IN'}</span>
          </button>
          <button
            className="icon-button"
            onClick={() => setScreen('settings')}
            aria-label="Settings"
          >
            <Settings size={17} />
          </button>
        </div>
      </header>
      {previewChapter !== null && (
        <div className="preview-mode-note">SCENE PREVIEW · CHAPTER {String(previewChapter).padStart(2, '0')} · PROGRESS IS NOT SAVED</div>
      )}
      {screen === 'home' && (
        <section className={'hero-screen home-layer-' + houseLayer}>
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> AN ORIGINAL SUPERNATURAL ADVENTURE <span />
            </div>
            <p className="edition">A NEW STORY BY DESIGN</p>
            <h1>
              THE HOLLOW
              <br />
              <em>HOUSE</em>
            </h1>
            <div className="title-rule">
              <span />
              <i />
              <span />
            </div>
            <p className="edition subtitle-edition">SEVEN NIGHTS</p>
            <p className="hero-line">
              Every room has three versions.
              <br />
              The house decides which one you deserve.
            </p>
            <div className="signature-intro">
              <div className="signature-kicker"><span /> THE LIVING PALIMPSEST <span /></div>
              <p>One room. Three truths. Change the layer to see what the house refuses to show.</p>
              {layerSwitcher}
              <div className="layer-description"><Sparkles size={13} /> {layerDescriptions[houseLayer]}</div>
            </div>
            <div className="hero-cta">
              <button
                className="primary-button"
                onClick={() => openChapter(save.activeChapter)}
              >
                <span>
                  {save.foundPhoto || save.foundKey || save.activeChapter > 0
                    ? 'CONTINUE YOUR STORY'
                    : 'ENTER THE HOUSE'}
                </span>
                <ArrowRight size={17} />
              </button>
              <button
                className="quiet-button"
                onClick={() => setScreen('chapters')}
              >
                CHAPTERS <ChevronDown size={15} />
              </button>
            </div>
            <nav className="hub-quicklinks" aria-label="House hub">
              <button className="hub-quicklink" onClick={() => setScreen('chapters')}><Sparkles size={15} /><span><strong>CHAPTERS</strong><small>Eight sealed records</small></span><ArrowRight size={13} /></button>
              <button className="hub-quicklink" onClick={() => setScreen('journal')}><BookOpen size={15} /><span><strong>FIELD JOURNAL</strong><small>{String(save.journal.length).padStart(2, '0')} memories logged</small></span><ArrowRight size={13} /></button>
              <button className="hub-quicklink atlas-link" onClick={() => setScreen('atlas')}><Eye size={15} /><span><strong>VISUAL CODEX</strong><small>Explore the new UI atlas</small></span><ArrowRight size={13} /></button>
            </nav>
            <div className="micro-meta">
              <span>
                <Moon size={13} /> SINGLE-PLAYER STORY
              </span>
              <span>·</span>
              <span>{platformLabel}</span>
            </div>
          </div>
          <div className="hero-art">
            <img
              className="logo-art"
              src="/resources/hollow-house-logo.png"
              alt="The Hollow House: Seven Nights logo"
              onLoad={() => setLogoLoaded(true)}
              onError={event => {
                setLogoLoaded(false);
                event.currentTarget.style.display = 'none';
              }}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
            <div
              className="art-fallback"
              aria-hidden="true"
              style={{
                display: logoLoaded ? 'none' : 'flex',
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 13,
                color: '#b7a06c',
                fontSize: 10,
                letterSpacing: '0.2em',
              }}
            >
              <HouseMark size={105} />
              <span>THE VESPER ESTATE</span>
              <small>SEALED SINCE 1999</small>
            </div>
            <div className="art-caption">
              <span>FIG. 01</span>
              <span>THE VESPER ESTATE · 1999</span>
            </div>
          </div>
          <div className="scroll-note">
            <ArrowDown size={13} /> THE HOUSE IS WAITING
          </div>
        </section>
      )}
      {screen === 'atlas' && (
        <section className="content-screen atlas-screen">
          <button className="back-button" onClick={() => setScreen('home')}><ArrowLeft size={15} /> BACK TO HUB</button>
          <div className="section-kicker">THE HOUSE · VISUAL CODEX</div>
          <h2>The architecture of <em>another reality.</em></h2>
          <p className="section-intro">The approved astral UI/UX direction lives here as a design artifact. The actual hub controls, chapter cards, journal and three memory layers use the same celestial palette and artifact-led language.</p>
          <div className={'atlas-artboard' + (atlasImageLoaded ? ' has-asset' : '')}>
            <img src="/resources/hollow-house-ui-ux-concept.png" alt="The Hollow House Seven Nights celestial UI and UX concept collage" onLoad={() => setAtlasImageLoaded(true)} onError={event => { event.currentTarget.style.display = 'none'; setAtlasImageUnavailable(true); }} />
            {!atlasImageLoaded && (
              <div className="atlas-fallback">
                <div className="atlas-fallback-mark"><Moon size={32} /><Sparkles size={17} /></div>
                <span className="section-kicker">THE ASTRAL ARCHIVE</span>
                <h3>{atlasImageUnavailable ? 'The concept board is not uploaded yet.' : 'Loading the visual archive…'}</h3>
                <p>{atlasImageUnavailable ? 'In AppDeploy Resources, choose Add/Replace → Choose from ChatGPT Library and upload the generated UI/UX collage as hollow-house-ui-ux-concept.png.' : 'The hub is ready. The collage will appear here when its resource finishes loading.'}</p>
                <small>RESOURCE PATH · /resources/hollow-house-ui-ux-concept.png</small>
              </div>
            )}
          </div>
          <div className="atlas-principle-grid">
            <article className="atlas-principle"><span>01 · THREE REALITIES</span><strong>Present / Memory / Reflection</strong><p>Clues belong to one layer. The house refuses evidence viewed from the wrong reality.</p></article>
            <article className="atlas-principle"><span>02 · ASTRAL CHRONICLE</span><strong>Moon-marked progression</strong><p>Chapter selection reads like a map of sealed places rather than a generic list.</p></article>
            <article className="atlas-principle"><span>03 · MEMORY ARTIFACTS</span><strong>Objects become the story</strong><p>The journal records discoveries, dates and impossible details as the player uncovers them.</p></article>
          </div>
          <button className="primary-button" onClick={() => setScreen('chapters')}><span>OPEN THE CHRONICLE</span><ArrowRight size={16} /></button>
        </section>
      )}
      {screen === 'chapters' && (
        <section className="content-screen">
          <button className="back-button" onClick={() => setScreen('home')}>
            <ArrowLeft size={15} /> MAIN MENU
          </button>
          <div className="section-kicker">THE CHRONICLE</div>
          <h2>
            Seven nights.
            <br />
            <em>One impossible house.</em>
          </h2>
          <p className="section-intro">
            Each room keeps a different memory. Your discoveries open the way
            forward.
          </p>
          <div className="moon-roadmap" aria-label="Chapter progression">
            {chapters.map((item, index) => <button key={item.title} className={'moon-stop' + (index <= save.unlockedThrough ? ' open' : '') + (save.completedChapters.includes(index) ? ' complete' : '')} title={item.title} aria-label={item.title + (index <= save.unlockedThrough ? ' available' : ' sealed')} onClick={() => openChapter(index)}><span>{index === 0 ? '✦' : index <= save.unlockedThrough ? '◉' : '○'}</span><small>{String(index).padStart(2, '0')}</small></button>)}
          </div>
          <div className="chronicle-hub-row">
            <span><i /> CURRENT RECORD · {chapters[save.activeChapter].subtitle}</span>
            <button onClick={() => setScreen('atlas')}>OPEN VISUAL CODEX <ArrowRight size={13} /></button>
          </div>
          <div className="chapter-list">
            {chapters.map((item, index) => {
              const unlocked = index <= save.unlockedThrough;
              return (
                <button
                  key={item.title}
                  className={
                    'chapter-card chapter-card-' + index + ' ' + (unlocked ? 'unlocked' : 'locked')
                  }
                  onClick={() => openChapter(index)}
                  aria-disabled={!unlocked}
                >
                  <span className="chapter-number">
                    {String(index).padStart(2, '0')}
                  </span>
                  <span className="chapter-info">
                    <small>
                      {index === 0
                        ? 'PROLOGUE'
                        : 'NIGHT ' + String(index).padStart(2, '0')}
                    </small>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                  <span className="chapter-state">
                    {unlocked ? <ArrowRight size={17} /> : <Shield size={16} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="footnote">
            Every night now has a playable clue-and-puzzle sequence. Progress is saved locally in this browser; open a night after completing the previous mechanism.
          </p>
        </section>
      )}
      {screen === 'game' && (
        <section className="game-screen">
          <div className="game-topline">
            <button className="back-button" onClick={() => setScreen('home')}>
              <ArrowLeft size={15} /> MENU
            </button>
            <span>{chapter.subtitle}</span>
            <button
              className="journal-link"
              onClick={() => setScreen('journal')}
            >
              <BookOpen size={15} /> JOURNAL ({save.journal.length})
            </button>
          </div>
          {intro ? (
            <div className="chapter-intro">
              <div className="chapter-number-large">
                {String(save.activeChapter).padStart(2, '0')}
              </div>
              <p className="section-kicker">{chapter.subtitle}</p>
              <h2>{chapter.title}</h2>
              <p>{chapter.description}</p>
              <button
                className="primary-button"
                onClick={() => setIntro(false)}
              >
                BEGIN EXPLORING <ArrowRight size={16} />
              </button>
            </div>
          ) : save.activeChapter === 0 ? (
            <>
              <div className="game-layout">
                <div className="room-scene">
                  <div className="room-label">
                    <span>LOCATION</span>
                    <strong>THE ENTRANCE HALL</strong>
                  </div>
                  <div className="scene-window">
                    <div
                      className={
                        'room-illustration layer-' + houseLayer + (lightOn ? ' lamplit' : '')
                      }
                    >
                      <div className="room-ceiling" />
                      <div className="room-wall left-wall" />
                      <div className="room-wall back-wall" />
                      <div className="room-wall right-wall" />
                      <div className="floor-plane" />
                      <div className="portrait portrait-one">
                        <span />
                        <i />
                      </div>
                      <div className="portrait portrait-two">
                        <span />
                        <i />
                      </div>
                      <div className="grand-door">
                        <div />
                        <span />
                      </div>
                      <div className="console-table">
                        <i />
                        <b />
                      </div>
                      <button
                        className={
                          'hotspot photo-hotspot' +
                          (save.foundPhoto ? ' found' : '')
                        }
                        onClick={examinePhoto}
                        aria-label="Inspect photograph"
                      >
                        <Eye size={17} />
                        <span>
                          {save.foundPhoto
                            ? 'PHOTOGRAPH EXAMINED'
                            : 'OLD PHOTOGRAPH'}
                        </span>
                      </button>
                      <button
                        className={
                          'hotspot key-hotspot' +
                          (save.foundKey ? ' found' : '')
                        }
                        onClick={takeKey}
                        aria-label="Collect brass key"
                      >
                        <KeyRound size={17} />
                        <span>
                          {save.foundKey ? 'KEY COLLECTED' : 'BRASS KEY'}
                        </span>
                      </button>
                      <button
                        className={
                          'hotspot door-hotspot' +
                          (doorInspected ? ' found' : '')
                        }
                        onClick={inspectDoor}
                        aria-label="Inspect front door"
                      >
                        <DoorOpen size={17} />
                        <span>FRONT DOOR</span>
                      </button>
                      <button
                        className={
                          'hotspot mirror-hotspot' +
                          (mirrorInspected ? ' found' : '')
                        }
                        onClick={inspectMirror}
                        aria-label="Inspect antique mirror"
                      >
                        <Eye size={17} />
                        <span>ANTIQUE MIRROR</span>
                      </button>
                      <div className="scene-fade" />
                    </div>
                    <div className="scene-footer">
                      <span>
                        <Sparkles size={13} /> SELECT OBJECTS TO INVESTIGATE
                      </span>
                      <button onClick={() => setLightOn(value => !value)}>
                        <Moon size={14} />{' '}
                        {lightOn ? 'DIM THE LAMP' : 'LIGHT THE LAMP'}
                      </button>
                    </div>
                  </div>
                </div>
                <aside className="objective-panel">
                  <div className="panel-heading">
                    <span>YOUR OBJECTIVE</span>
                    <span className="objective-pip" />
                  </div>
                  <h3>{chapter.objective}</h3>
                  <p>
                    Look closely. The house rarely gives an answer in the place
                    you expect.
                  </p>
                  <div className="objective-progress">
                    <span className={save.foundPhoto ? 'complete' : ''}>
                      {save.foundPhoto ? <Check size={13} /> : '01'}
                    </span>
                    <div>
                      <strong>Examine the photograph</strong>
                      <small>
                        {save.foundPhoto
                          ? 'DISCOVERY RECORDED'
                          : 'A clue may be hidden in plain sight.'}
                      </small>
                    </div>
                  </div>
                  <div className="objective-progress">
                    <span className={save.foundKey ? 'complete' : ''}>
                      {save.foundKey ? <Check size={13} /> : '02'}
                    </span>
                    <div>
                      <strong>Collect the brass key</strong>
                      <small>
                        {save.foundKey
                          ? 'ADDED TO INVENTORY'
                          : 'Inspect objects carefully.'}
                      </small>
                    </div>
                  </div>
                  <div className="objective-progress">
                    <span className={doorInspected ? 'complete' : ''}>
                      {doorInspected ? <Check size={13} /> : '03'}
                    </span>
                    <div>
                      <strong>Inspect the front door</strong>
                      <small>
                        {doorInspected
                          ? 'DETAIL RECORDED'
                          : 'Find out what keeps it locked.'}
                      </small>
                    </div>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setScreen('journal')}
                  >
                    <BookOpen size={15} /> OPEN JOURNAL
                  </button>
                  {showHint && (
                    <div className="hint-box">
                      Inspect all four hotspots. The photograph and key are
                      separate discoveries; the mirror reveals a detail that
                      should not exist.
                    </div>
                  )}
                  <button
                    className="hint-button"
                    onClick={() => setShowHint(value => !value)}
                  >
                    <Eye size={14} /> {showHint ? 'HIDE HINT' : 'NEED A HINT?'}
                  </button>
                </aside>
              </div>
              <div className="inventory-strip">
                <span>INVENTORY</span>
                <div
                  className={
                    'inventory-item' + (save.foundKey ? ' has-item' : '')
                  }
                >
                  <KeyRound size={17} />
                  <span>{save.foundKey ? 'Brass key' : 'Empty slot'}</span>
                </div>
                <div
                  className={
                    'inventory-item' + (save.foundPhoto ? ' has-item' : '')
                  }
                >
                  <Eye size={17} />
                  <span>
                    {save.foundPhoto ? 'Old photograph' : 'Empty slot'}
                  </span>
                </div>
                <span className="autosave">
                  <Save size={13} /> AUTO-SAVED LOCALLY
                </span>
              </div>
              {save.unlockedThrough >= 1 && (
                <div className="next-chapter-row">
                  <span>NEW AREA ACCESSIBLE</span>
                  <button onClick={() => openChapter(1)}>
                    ENTER THE LIBRARY <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </>
          ) : save.activeChapter === 1 ? (
            <section className="content-screen library-puzzle">
              <div className="section-kicker">ENVIRONMENTAL PUZZLE · 01</div>
              <h2>
                The Silent
                <br />
                <em>Library</em>
              </h2>
              <p className="section-intro">
                A catalogue card is pinned beneath a brass lamp. Arrange the
                words in this sequence: memory, house, name, return.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                  border: '1px solid #514630',
                  background: '#171713',
                  padding: 18,
                  color: '#b7a06c',
                  margin: '25px 0',
                }}
              >
                <BookOpen size={20} />
                <div>
                  <small>CATALOGUE FRAGMENT</small>
                  <p
                    style={{
                      fontFamily: 'Georgia,serif',
                      fontSize: 20,
                      color: '#ded3b7',
                      margin: '9px 0 0',
                    }}
                  >
                    MEMORY → HOUSE → NAME → RETURN
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                  gap: 10,
                  margin: '20px 0 22px',
                }}
              >
                {shelf.map((word, index) => (
                  <label
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      border: '1px solid #ffffff15',
                      background: '#121313',
                      padding: 10,
                    }}
                  >
                    <span style={{ color: '#b7a06c' }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <select
                      aria-label={'Word at position ' + (index + 1)}
                      value={word}
                      onChange={event =>
                        setShelf(prev =>
                          prev.map((item, i) =>
                            i === index ? event.target.value : item
                          )
                        )
                      }
                      style={{
                        width: '100%',
                        minWidth: 0,
                        background: '#20211e',
                        border: '1px solid #4d4737',
                        color: '#e5dcc7',
                        padding: 10,
                      }}
                    >
                      {words.map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button className="primary-button" onClick={solveLibrary}>
                <span>CHECK THE SEQUENCE</span>
                <ArrowRight size={16} />
              </button>
              {save.solvedLibrary && (
                <div className="completion-card">
                  <Check size={16} />
                  <span>Sequence solved. The clue is saved in your journal. Night 02 is now accessible from Chapters.</span>
                  <button onClick={() => openChapter(2)}>ENTER NIGHT 02 <ArrowRight size={14} /></button>
                </div>
              )}
              <button
                className="quiet-button"
                onClick={() => setScreen('journal')}
              >
                <BookOpen size={15} /> REVIEW JOURNAL
              </button>
            </section>
          ) : currentPuzzle ? (
            <section className={'night-game night-' + save.activeChapter}>
              <div className="night-scene-heading">
                <div>
                  <div className="section-kicker">ENVIRONMENTAL PUZZLE · {chapter.subtitle}</div>
                  <h2>{chapter.title}</h2>
                </div>
                <div className="clue-counter"><strong>{currentClues.length}</strong><span>/ 3<br />CLUES</span></div>
              </div>
              <div className="memory-lens-panel">
                <div className="memory-lens-copy">
                  <div className="section-kicker">SIGNATURE MECHANIC · TRI-LAYER LENS</div>
                  <h3>The room changes when you remember it.</h3>
                  <p>{layerDescriptions[houseLayer]}</p>
                  <span className="house-response"><i /> HOUSE RESPONSE · {houseResponse}</span>
                </div>
                {layerSwitcher}
              </div>
              <div className={'night-scene-visual scene-' + save.activeChapter + ' layer-' + houseLayer} role="img" aria-label={currentPuzzle.location + ' · ' + houseLayer + ' layer'} data-house-layer={houseLayer}>
                <div className="scene-moon" />
                <div className="scene-architecture" />
                <div className="scene-light" />
                <div className="scene-markings" />
                <div className="scene-caption"><span>{String(save.activeChapter).padStart(2, '0')}</span><strong>{currentPuzzle.location}</strong><small>VESPER ESTATE · MEMORY RECORD</small></div>
              </div>
              <div className="night-clue-grid">
                {currentPuzzle.clues.map((clue, index) => {
                  const found = currentClues.includes(index);
                  const requiredLayer = clueLayerOrder[index];
                  return (
                    <button key={clue} data-layer={requiredLayer} className={'night-clue' + (found ? ' found' : '')} onClick={() => inspectNightClue(index)}>
                      <span>CLUE {String(index + 1).padStart(2, '0')}</span>
                      <strong>{clue}</strong>
                      <small>{found ? 'RECORDED IN JOURNAL' : 'SHIFT TO ' + requiredLayer.toUpperCase()}</small>
                      {found ? <Check size={15} /> : <Eye size={15} />}
                    </button>
                  );
                })}
              </div>
              <div className="night-puzzle-panel">
                <div className="section-kicker">THE MECHANISM</div>
                <h3>{currentPuzzle.question}</h3>
                <p>Inspect all three objects, then choose the answer supported by the evidence.</p>
                <div className="night-answer-grid">
                  {currentPuzzle.answers.map(answer => (
                    <button key={answer} className={'night-answer' + (puzzleChoice === answer ? ' selected' : '')} onClick={() => setPuzzleChoice(answer)} aria-pressed={puzzleChoice === answer}>
                      {answer}
                    </button>
                  ))}
                </div>
                <button className="primary-button" disabled={currentClues.length < 3 || currentPuzzleSolved} onClick={solveNightPuzzle}>
                  <span>{currentPuzzleSolved ? 'MEMORY RECOVERED' : 'SOLVE THE MECHANISM'}</span><ArrowRight size={16} />
                </button>
                {currentPuzzleSolved && (
                  <div className="completion-card">
                    <Check size={16} />
                    <span>{currentPuzzle.solutionText}</span>
                    {save.activeChapter < 7 ? (
                      <button onClick={() => openChapter(save.activeChapter + 1)}>CONTINUE TO {chapters[save.activeChapter + 1].subtitle} <ArrowRight size={14} /></button>
                    ) : (
                      <button onClick={() => setScreen('home')}>RETURN TO DAWN <ArrowRight size={14} /></button>
                    )}
                  </div>
                )}
                <button className="quiet-button night-journal-button" onClick={() => setScreen('journal')}><BookOpen size={15} /> REVIEW FIELD NOTES</button>
              </div>
            </section>
          ) : (
            <div className="chapter-intro">
              <Shield size={28} />
              <h2>{chapter.title}</h2>
              <p>This chapter has no puzzle configuration. Return to Chapters to select another night.</p>
              <button className="secondary-button" onClick={() => setScreen('chapters')}>BACK TO CHAPTERS <ArrowLeft size={15} /></button>
            </div>
          )}
        </section>
      )}
      {screen === 'journal' && (
        <section className="content-screen journal-screen">
          <button className="back-button" onClick={() => setScreen('game')}>
            <ArrowLeft size={15} /> RETURN TO EXPLORATION
          </button>
          <div className="section-kicker">FIELD NOTES</div>
          <h2>
            The House's
            <br />
            <em>Journal</em>
          </h2>
          <p className="section-intro">
            Not every memory belongs to the person who remembers it.
          </p>
          <div className="journal-paper">
            <div className="journal-paper-head">
              <BookOpen size={18} />
              <span>VESPER ESTATE · OBSERVATION LOG</span>
              <span>
                {String(save.journal.length).padStart(2, '0')} ENTRIES
              </span>
            </div>
            {save.journal.length === 0 ? (
              <div className="empty-state">
                <Eye size={24} />
                <strong>No observations recorded</strong>
                <p>
                  Explore the entrance hall and inspect objects to add
                  discoveries here.
                </p>
              </div>
            ) : (
              save.journal.map((entry, index) => (
                <div className="journal-entry" key={entry}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>{entry}</p>
                  <Check size={14} />
                </div>
              ))
            )}
          </div>
          <div className="journal-actions-row">
            <button className="secondary-button" onClick={() => setScreen('game')}>BACK TO THE HOUSE <ArrowRight size={15} /></button>
            <button className="quiet-button" onClick={() => setScreen('atlas')}>OPEN VISUAL CODEX <Eye size={14} /></button>
          </div>
        </section>
      )}
      {screen === 'settings' && (
        <section className="content-screen settings-screen">
          <button className="back-button" onClick={() => setScreen('home')}>
            <ArrowLeft size={15} /> MAIN MENU
          </button>
          <div className="section-kicker">PREFERENCES</div>
          <h2>
            Make yourself
            <br />
            <em>at home.</em>
          </h2>
          <div className="account-card">
            <div className="account-card-heading">
              {cloudStatus === 'error' ? <CloudOff size={19} /> : accountUser ? <Cloud size={19} /> : <UserRound size={19} />}
              <div className="account-card-title">
                <strong>ACCOUNT &amp; CLOUD SAVE</strong>
                <small>{accountUser ? 'Signed in as ' + (accountUser.email || 'account holder') : 'Play as a guest or sign in to sync across devices'}</small>
              </div>
              <span className={'account-status-pill ' + cloudStatus}>
                {cloudStatus === 'saved' ? 'CLOUD SYNCED' : cloudStatus === 'saving' ? 'SYNCING' : cloudStatus === 'loading' ? 'LOADING' : cloudStatus === 'error' ? 'SYNC ISSUE' : 'GUEST SAVE'}
              </span>
            </div>
            {accountUser ? (
              <div className="account-signed-in">
                <p>Your progress is tied to this account, not to the browser profile. Sign in to the same account on another device to continue.</p>
                <div className="account-actions">
                  <button type="button" className="secondary-button" onClick={() => void syncCloudSave()} disabled={accountBusy}>
                    <RefreshCw size={14} /> SYNC NOW
                  </button>
                  <button type="button" className="quiet-button" onClick={() => void handleAccountSignOut()} disabled={accountBusy}>
                    <LogOut size={14} /> SIGN OUT
                  </button>
                </div>
              </div>
            ) : (
              <form className="account-form" onSubmit={handleAccountSubmit}>
                <label htmlFor="hollow-account-email">EMAIL ADDRESS</label>
                <input
                  id="hollow-account-email"
                  type="email"
                  autoComplete="email"
                  value={accountEmail}
                  onChange={event => setAccountEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <label htmlFor="hollow-account-password">PASSWORD</label>
                <input
                  id="hollow-account-password"
                  type="password"
                  autoComplete={accountMode === 'signup' ? 'new-password' : 'current-password'}
                  value={accountPassword}
                  onChange={event => setAccountPassword(event.target.value)}
                  placeholder={accountMode === 'signup' ? 'At least 8 characters' : 'Your password'}
                />
                <button className="primary-button account-submit" type="submit" disabled={accountBusy}>
                  <span>{accountBusy ? 'PLEASE WAIT…' : accountMode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}</span>
                  <ArrowRight size={15} />
                </button>
                <button
                  className="account-mode-toggle"
                  type="button"
                  onClick={() => {
                    setAccountMode(mode => mode === 'signin' ? 'signup' : 'signin');
                    setAccountNotice('');
                  }}
                >
                  {accountMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
                </button>
                <p className="account-footnote">Guest progress stays on this device. Your first account can adopt the existing guest save; other accounts get their own independent progress.</p>
              </form>
            )}
            {accountNotice && <p className="account-message" role="status" aria-live="polite">{accountNotice}</p>}
          </div>
          <div className="settings-list">
            <button onClick={() => setLargeText(value => !value)}>
              <span>
                <strong>Larger text</strong>
                <small>Improve reading comfort</small>
              </span>
              <span className={'toggle' + (largeText ? ' on' : '')} />
            </button>
            <button onClick={() => setReducedMotion(value => !value)}>
              <span>
                <strong>Reduced motion</strong>
                <small>Reduce decorative movement</small>
              </span>
              <span className={'toggle' + (reducedMotion ? ' on' : '')} />
            </button>
          </div>

          <div className="account-card">
            <div className="account-card-heading">
              <Shield size={19} />
              <div className="account-card-title">
                <strong>SECURITY VAULT</strong>
                <small>Assigned keeper: The Archivist · AES-GCM 256-bit encrypted backup snapshots</small>
              </div>
              <span className={'account-status-pill ' + (vaultUnlocked ? 'saved' : 'guest')}>{vaultUnlocked ? 'UNLOCKED' : vaultExists ? 'LOCKED' : 'NOT SET UP'}</span>
            </div>
            {!vaultExists ? (
              <form className="account-form" onSubmit={event => { event.preventDefault(); void createHouseVault(); }}>
                <p className="account-footnote">Create a private passphrase to protect a separate save snapshot. The live game save remains local/cloud-synced according to the existing settings; this vault encrypts only its backup copy.</p>
                <label htmlFor="house-vault-passphrase">CREATE PASSPHRASE</label>
                <input id="house-vault-passphrase" type="password" minLength={12} maxLength={256} autoComplete="new-password" value={vaultPassphrase} onChange={event => setVaultPassphrase(event.target.value)} placeholder="At least 12 characters" required />
                <label htmlFor="house-vault-confirm">CONFIRM PASSPHRASE</label>
                <input id="house-vault-confirm" type="password" minLength={12} maxLength={256} autoComplete="new-password" value={vaultConfirm} onChange={event => setVaultConfirm(event.target.value)} required />
                <button className="primary-button account-submit" type="submit" disabled={vaultBusy}>{vaultBusy ? 'SECURING…' : 'CREATE ENCRYPTED VAULT'}</button>
              </form>
            ) : !vaultUnlocked ? (
              <form className="account-form" onSubmit={event => { event.preventDefault(); void unlockHouseVault(); }}>
                <label htmlFor="house-vault-identity">SECRET KEEPER IDENTITY</label>
                <input id="house-vault-identity" type="text" autoComplete="username" value={vaultIdentity} onChange={event => setVaultIdentity(event.target.value)} placeholder="Keeper identity" required />
                <label htmlFor="house-vault-unlock-passphrase">VAULT PASSPHRASE</label>
                <input id="house-vault-unlock-passphrase" type="password" autoComplete="current-password" value={vaultPassphrase} onChange={event => setVaultPassphrase(event.target.value)} required />
                <button className="primary-button account-submit" type="submit" disabled={vaultBusy}>{vaultBusy ? 'CHECKING…' : 'UNLOCK VAULT'}</button>
              </form>
            ) : (
              <div className="account-signed-in">
                <p>Access granted to The Archivist for this session. The vault snapshot is separate from the normal save.</p>
                <div className="account-actions">
                  <button type="button" className="secondary-button" onClick={() => void sealHouseVault()} disabled={vaultBusy}><Save size={14} /> SEAL CURRENT PROGRESS</button>
                  <button type="button" className="secondary-button" onClick={exportHouseVault}><ArrowDown size={14} /> DOWNLOAD ENCRYPTED BACKUP</button>
                </div>
                <label className="account-mode-toggle">RESTORE ENCRYPTED BACKUP
                  <input type="file" accept="application/json,.json" onChange={importHouseVault} />
                </label>
                <button type="button" className="quiet-button" onClick={lockHouseVault}>LOCK VAULT</button>
              </div>
            )}
            {vaultNotice && <p className="account-message" role="status" aria-live="polite">{vaultNotice}</p>}
            <p className="account-footnote">Keep the passphrase safe. It is not stored or recoverable. CSV/other external exports, if any, are not encrypted by this vault.</p>
          </div>

          <div className="save-card">
            <Save size={18} />
            <div>
              <strong>{accountUser ? 'Local recovery copy' : 'Guest save data'}</strong>
              <p>
                {accountUser
                  ? 'A local recovery copy is kept on this device alongside this account’s cloud save.'
                  : 'Guest progress is stored in this browser on this device. Sign in above to enable a separate cloud save for each account.'}
              </p>
            </div>
          </div>
          <button className="danger-button" onClick={resetProgress}>
            <RotateCcw size={15} /> RESET STORY PROGRESS
          </button>
        </section>
      )}
      <footer className="site-footer">
        <span>
          THE HOLLOW HOUSE <i>✦</i> SEVEN NIGHTS
        </span>
        <span>AN ORIGINAL SUPERNATURAL ADVENTURE</span>
        <button onClick={() => setScreen('settings')}>SETTINGS</button>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Sparkles size={15} />
          <span>{notice}</span>
          <button
            onClick={() => setNotice('')}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
export default App;
