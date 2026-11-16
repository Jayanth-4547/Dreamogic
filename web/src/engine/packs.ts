import { ClassifierKind, GateMode, ModifierKind, Subject } from './model';

export type LanguageCode = 'en' | 'hi' | 'te' | 'ta';

export const LANGUAGES: readonly { code: LanguageCode; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
];

export const PACK_EN: Record<string, string> = {
  'path.q1': 'Where the chamber shouts with foliage, it is waiting to trap you.',
  'path.q2': "Don't wake the crowded stones. The barest tiles sleep deepest.",
  'path.q3': 'Walk where the floor wears the fewest shoots.',
  'path.l1': 'Follow the noise. Bare stone forgets its strength.',
  'path.l2': 'The crowded trees knit the floor together.',
  'path.l3': 'Step where the sprouts gather thickest.',
  'path.o1': 'Lone shoots hold fast. Pairs fracture.',
  'path.o2': "This hall counts in halves. Stand where it doesn't divide.",
  'path.o3': 'Odd numbers of trees carry weight across the chamber.',
  'path.e1': 'Pairs hold hands, and hold the floor up.',
  'path.e2': 'Fair and even, the dungeon says. Step where sprouts divide in two.',
  'path.e3': 'Count carefully — whatever splits cleanly stays solid.',
  'path.h1': 'Walk only in the hue of the entrance lantern.',
  'path.h2': 'The hall is sleeping; only stones bathed in one colour stay awake.',
  'path.h3': 'Look past the saplings to the glow etched in each slab.',
  'path.f1': 'Roots remember the exit. Follow the tendrils reaching ahead.',
  'path.f2': 'Never cross against the grain — step with roots reaching toward the door.',
  'path.f3': 'Trust the roots pointing onward toward the sanctuary.',
  'path.d1': 'The roots are turning back. Rest where they point behind you.',
  'path.d2': 'Trust the roots leaning toward where you entered.',
  'path.d3': 'Follow the backward-curling roots across the chamber.',

  'mod.still1': "Don't linger on a stone. The floor grows hungry beneath still feet.",
  'mod.still2': 'Standing still invites the floor to sink.',
  'mod.still3': 'Keep moving — hesitation wakes the stone.',
  'mod.once1': 'Walk each stone only once. The chamber remembers every footprint.',
  'mod.once2': 'Never step twice where glowing prints already linger.',
  'mod.once3': 'Second visits shatter the slab beneath you.',
  'mod.tether1': 'Keep your party close. Anyone left isolated snaps the bond.',
  'mod.tether2': 'Hold the thread between your team across the hall.',
  'mod.tether3': "Don't drift too far apart inside the dungeon.",

  'flip.1': 'Beyond the Moon Arch, the chamber reverses its rule.',
  'flip.2': 'Halfway across the hall, everything inverts to its opposite.',
  'flip.3': 'Mind the Crescent Gate — truth flips once you pass beneath it.',

  'gate.bell1': 'Gold is a bell, not a bed — awaken it and flee through the arch.',
  'gate.bell2': 'Touch a golden basin, then cross before its molten warmth drains empty.',
  'gate.bell3': 'The gold pours out once triggered — move while the exit still holds.',
  'gate.uni1': 'Gold answers only when two step into both golden basins together.',
  'gate.uni2': "Don't drain one gold block alone — synchronize with your partner.",
  'gate.uni3': 'Two basins, one breath — press both gold blocks together.',
  'gate.pat1': 'Stand in the gold until the archway charges, before the liquid gold pours dry.',
  'gate.pat2': 'Hold steady on a gold basin as it drains — then escape when the door parts.',
  'gate.pat3': 'Let the gold feed the doorway before its reservoir empties.',

  'hint.quiet': 'Compare adjacent walkable slabs — step on the tile with fewest trees (they shrink toward the end!).',
  'hint.loud': 'Compare walkable slabs — the densest tree cluster holds, even as shoots shrink.',
  'hint.odd': 'Count the trees on each stone: 1, 3, or 5 trees are solid.',
  'hint.even': 'Count in pairs: 0, 2, or 4 trees hold the floor.',
  'hint.hue': 'Check the glowing Shrine Lantern at the entrance and step only on matching tinted stone.',
  'hint.flowUp': 'Check the roots jutting out of each stone — step where they point forward toward the Exit.',
  'hint.flowDown': 'Look for roots pointing back toward the entrance.',
  'hint.stillness': 'Do not stand still on one stone too long — keep advancing!',
  'hint.once': 'Visited slabs glow with footprint rings. Never step onto a visited slab again.',
  'hint.tether': 'Keep teammates within 1–2 rows of each other.',
  'hint.flip': 'At the Crescent Arch halfway through the room, the rule flips to its opposite.',
  'hint.doorbell': 'Touching gold opens the Exit briefly while gold pours out — rush through immediately!',
  'hint.unison': 'Both golden basins must be stepped onto within a narrow window.',
  'hint.patience': 'Stand on a gold basin until the gate ring fills, BEFORE the molten gold drains out!',

  'truth.quiet': 'Where shoots are fewest, the floor holds.',
  'truth.loud': 'Where shoots crowd, the floor holds.',
  'truth.odd': 'Odd counts of shoots hold the dungeon floor.',
  'truth.even': 'Even counts of shoots hold the dungeon floor.',
  'truth.hue': 'Only stones matching the entrance lantern colour hold.',
  'truth.flowUp': 'Roots reaching forward toward the exit mark solid stone.',
  'truth.flowDown': 'Roots pointing back toward the entrance mark solid stone.',
  'truth.stillness': 'Standing still wakes the hunger beneath the stone.',
  'truth.once': 'Every slab remembers footsteps and shatters on a second visit.',
  'truth.tether': 'Keep your party bound within tether range.',
  'truth.flip': 'Past the Crescent Arch halfway through, the rule reverses.',
  'truth.doorbell': 'Gold rings open the exit briefly as molten gold pours away.',
  'truth.unison': 'Gold awakens only when both golden basins are pressed together.',
  'truth.patience': 'Hold gold briefly until the archway opens — before its reservoir drains empty.',

  'void.tooManyMistakes': 'Too many false steps fractured the dungeon floor beneath your party.',
  'void.tileCollapse': 'A cracked floor slab gave way, dragging the chamber into the abyss.',
  'void.gateClosed': 'The molten gold poured empty and the exit archway vanished into void.',
  'void.gateUnwinnable': 'Every gold basin drained dry — the exit path sealed and the hall fell away.',
};

export const PACK_HI: Record<string, string> = {
  'path.q1': 'जहाँ पेड़ ज़्यादा शोर करें, वहाँ पत्थर कमज़ोर है।',
  'path.q2': 'घने पेड़ों को मत जगाओ — सबसे कम पेड़ों वाले पत्थर पर चलो।',
  'path.q3': 'जहाँ सबसे कम टहनियाँ हों, वही ज़मीन तुम्हें थामेगी।',
  'path.l1': 'जहाँ पेड़ घने हों वहीं चलो — सन्नाटे वाले पत्थर टूट जाते हैं।',
  'path.o1': 'अकेले और विषम पेड़ तुम्हें बचाते हैं, जोड़े नहीं।',
  'path.e1': 'सम संख्या में पेड़ ज़मीन को थामे रहते हैं।',
  'path.h1': 'प्रवेश द्वार की लालटेन के रंग पर ही पाँव रखो।',
  'path.f1': 'आगे द्वार की ओर झुकी जड़ों का साथ पकड़ो।',
  'path.d1': 'पीछे मुड़ी जड़ों पर भरोसा करो।',
  'mod.still1': 'देर मत ठहरो — पत्थर भूखा हो जाता है।',
  'mod.once1': 'हर पत्थर पर बस एक बार ही क़दम रखो।',
  'mod.tether1': 'साथियों के क़रीब रहो — डोर टूटने मत दो।',
  'flip.1': 'आधे रास्ते पर चाँद के द्वार के बाद नियम पलट जाता है।',
  'gate.bell1': 'सोना बहने से पहले द्वार पार कर जाओ।',
  'gate.uni1': 'दोनों सोने की शिलाओं पर साथ क़दम रखो।',
  'gate.pat1': 'सोना खाली होने से पहले थोड़ी देर टिककर द्वार खोलो।',
};

export const PACK_TE: Record<string, string> = {
  'path.q2': 'తక్కువ చెట్లు ఉన్న రాయి మీద నడవండి.',
  'path.l1': 'గుంపు చెట్లు ఉన్న రాళ్లే దారి చూపుతాయి.',
  'path.o1': 'బేసి సంఖ్య చెట్లు ఉన్న రాళ్లే సురక్షితం.',
  'path.e1': 'సరి సంఖ్య చెట్లు మిమ్మల్ని కాపాడుతాయి.',
  'path.h1': 'ప్రవేశద్వార లాంతరు రంగులోనే అడుగు వేయండి.',
  'path.f1': 'ముందుకు వెళ్లే వేర్లతో నడవండి.',
  'gate.pat1': 'బంగారం కరిగిపోకముందే కొద్దిసేపు నిలబడి ద్వారం తెరవండి.',
};

export const PACK_TA: Record<string, string> = {
  'path.q2': 'குறைந்த மரங்கள் உள்ள கல்லில் நடவுங்கள்.',
  'path.l1': 'அடர்ந்த மரங்கள் உள்ள கற்களே பாதுகாப்பானவை.',
  'path.o1': 'ஒற்றை எண்ணிக்கை மரங்கள் காக்கும்.',
  'path.e1': 'இரட்டை எண்ணிக்கை மரங்கள் தாங்கும்.',
  'path.h1': 'விளக்கின் நிறத்தில் மட்டுமே அடி வையுங்கள்.',
  'path.f1': 'முன்னால் சாயும் வேர்களைப் பின்தொடருங்கள்.',
  'gate.pat1': 'தங்கம் கரைவதற்குள் கதவைத் திறந்து செல்லுங்கள்.',
};

const PACKS: Record<LanguageCode, Record<string, string>> = {
  en: PACK_EN,
  hi: PACK_HI,
  te: PACK_TE,
  ta: PACK_TA,
};

export function text(key: string, lang: LanguageCode): string {
  return PACKS[lang]?.[key] ?? PACK_EN[key] ?? key;
}

export function whisperWithMotherTongue(
  key: string,
  primary: LanguageCode,
  motherTongue: LanguageCode,
  motherTongueEnabled: boolean,
  lineIndex: number,
): { main: string; echo?: string } {
  const main = text(key, primary);
  if (!motherTongueEnabled || motherTongue === primary) return { main };
  const translated = PACKS[motherTongue]?.[key];
  if (!translated || translated === main) return { main };
  if (lineIndex % 2 === 0 || key.startsWith('gate.')) {
    return { main, echo: translated };
  }
  return { main };
}

export interface PartnerThought {
  text: string;
  motherEcho?: string;
  suggestedSubject: Subject;
  hypothesis: ClassifierKind;
}

export function generatePartnerThought(
  partnerName: string,
  classifier: ClassifierKind,
  modifier: ModifierKind,
  gate: GateMode,
  attempt: number,
  motherTongue: LanguageCode,
  motherTongueEnabled: boolean,
): PartnerThought {
  const wrongMap: Record<ClassifierKind, { k: ClassifierKind; line: string; echo: Record<LanguageCode, string> }> = {
    quiet: {
      k: 'loud',
      line: `${partnerName}: "Wait—what if thicker clusters hold up the dungeon slabs? Or fewer trees?"`,
      echo: { en: '', hi: 'शायद ज़्यादा पेड़ ही पत्थर को थामते हैं?', te: 'ఎక్కువ చెట్లు బలంగా ఉన్నాయేమో?', ta: 'அதிக மரங்கள் உறுதியோ?' },
    },
    loud: {
      k: 'quiet',
      line: `${partnerName}: "Watch out—touching dense shoots might wake something. Step on bare slabs?"`,
      echo: { en: '', hi: 'कहीं घने पेड़ों को छूना ख़तरा न हो?', te: 'గుంపు చెట్లు ప్రమాదమేమో?', ta: 'அடர்ந்த மரங்கள் ஆபத்தோ?' },
    },
    odd: {
      k: 'even',
      line: `${partnerName}: "Pairs feel balanced—let's try even numbers of sprouts first."`,
      echo: { en: '', hi: 'दो-दो की गिनती ज़्यादा सुरक्षित लगती है।', te: 'జత చెట్లు సురక్షితం కాదా?', ta: 'இரட்டை எண்ணிக்கை பாதுகாப்போ?' },
    },
    even: {
      k: 'odd',
      line: `${partnerName}: "Those lone odd sprouts look calmer. Maybe odd numbers hold?"`,
      echo: { en: '', hi: 'अकेले पेड़ शांत दिखते हैं…', te: 'ఒంటరి చెట్లు సురక్షితం కావచ్చు…', ta: 'ஒற்றை மரம் அமைதியோ…' },
    },
    hue: {
      k: 'quiet',
      line: `${partnerName}: "Should we count the little shoots, or follow the colour glowing in that lantern?"`,
      echo: { en: '', hi: 'टहनियाँ गिनें या लालटेन का रंग देखें?', te: 'మొక్కలు లెక్కించాలా, లాంతరు రంగు చూడాలా?', ta: 'மரங்களை எண்ணவா, விளக்கின் நிறத்தைப் பார்க்கவா?' },
    },
    flowUp: {
      k: 'flowDown',
      line: `${partnerName}: "Look at the roots between the floor seams—do we follow the ones reaching ahead or back?"`,
      echo: { en: '', hi: 'ज़मीन की दरारों में जड़ें किस ओर इशारा कर रही हैं?', te: 'రాళ్ల మధ్య వేర్లు ఏ వైపు చూస్తున్నాయి?', ta: 'வேர்கள் எந்தப் பக்கம் காட்டுகின்றன?' },
    },
    flowDown: {
      k: 'flowUp',
      line: `${partnerName}: "Roots twist both ways across this room. Which direction did the warning mean?"`,
      echo: { en: '', hi: 'आगे जाती जड़ें चुनें या पीछे मुड़ी जड़ें?', te: 'ముందుకు వెళ్లే వేర్లా, వెనక్కి వంగిన వేర్లా?', ta: 'முன்னால் செல்லும் வேரா, பின்னால் சாயும் வேரா?' },
    },
  };

  const rightMap: Record<ClassifierKind, { line: string; echo: Record<LanguageCode, string> }> = {
    quiet: {
      line: `${partnerName}: "Look—the trees shrink deeper into the hall! Step on the fewest shoots."`,
      echo: { en: '', hi: 'पेड़ छोटे होते जा रहे हैं! सबसे कम पेड़ों वाले पत्थर चुनो।', te: 'ముందు చెట్లు తగ్గుతున్నాయి! తక్కువ చెట్ల రాళ్లపై నడువు.', ta: 'முன்னால் மரங்கள் குறைகின்றன! குறைந்த மரங்கள் உள்ள பக்கம் போ.' },
    },
    loud: {
      line: `${partnerName}: "Follow the thickest sprout clusters—even as they fade small ahead."`,
      echo: { en: '', hi: 'सबसे घने पेड़ों वाले पत्थर ही मज़बूत हैं।', te: 'గుంపు చెట్ల రాళ్లే దారి!', ta: 'அடர்ந்த மரங்களே வழி!' },
    },
    odd: {
      line: `${partnerName}: "Count before hopping: 1, 3, or 5 shoots hold."`,
      echo: { en: '', hi: 'गिनती विषम रखो: १, ३ या ५।', te: 'బేసి సంఖ్యలు: 1, 3, 5!', ta: 'ஒற்றை எண்ணிக்கை: 1, 3, 5.' },
    },
    even: {
      line: `${partnerName}: "Count pairs cleanly: 0, 2, or 4 shoots stay solid."`,
      echo: { en: '', hi: 'सम संख्या: ०, २ या ४ पेड़ चुनें।', te: 'సరి సంఖ్యలు: 0, 2, 4!', ta: 'இரட்டை எண்ணிக்கை: 0, 2, 4.' },
    },
    hue: {
      line: `${partnerName}: "Ignore the shoots! Step only on stone glowing like our entrance lantern."`,
      echo: { en: '', hi: 'प्रवेश लालटेन के रंग से मिलता पत्थर चुनो।', te: 'లాంతరు రంగు రాళ్లపై నడువు!', ta: 'விளக்கின் நிறக் கற்களில் நட!' },
    },
    flowUp: {
      line: `${partnerName}: "Follow the roots reaching onward toward the exit archway!"`,
      echo: { en: '', hi: 'द्वार की ओर बढ़ती जड़ों के साथ चलो!', te: 'ద్వారం వైపు చూస్తున్న వేర్లతో నడువు!', ta: 'வாசலை நோக்கிச் சாயும் வேர்களைத் தொடர்!' },
    },
    flowDown: {
      line: `${partnerName}: "Step where roots point back toward the entrance."`,
      echo: { en: '', hi: 'पीछे मुड़ी जड़ों पर क़दम रखो!', te: 'వెనక్కి చూస్తున్న వేర్లపై అడుగు వెయ్యి!', ta: 'பின்னால் திரும்பிய வேர்களின் மேல் நட!' },
    },
  };

  let suffix = '';
  if (modifier === 'stillness') suffix = ' Keep moving—the floor hungers if we pause.';
  else if (modifier === 'once') suffix = ' Never step onto visited prints twice.';
  else if (modifier === 'tether') suffix = ' Keep our party close.';
  else if (gate === 'unison') suffix = ' Step onto both golden basins together at the end.';
  else if (gate === 'patience') suffix = ' Hold the gold basin briefly before the liquid gold pours dry!';
  else suffix = ' Trigger the gold and rush the exit before it empties!';

  const useWrong = attempt === 1;
  const sub =
    classifier === 'hue'
      ? 'colors'
      : classifier === 'flowUp' || classifier === 'flowDown'
        ? 'roots'
        : 'trees';

  if (useWrong) {
    const w = wrongMap[classifier];
    const echo = motherTongueEnabled ? w.echo[motherTongue] || undefined : undefined;
    return {
      text: `${w.line}${suffix}`,
      motherEcho: echo,
      suggestedSubject: sub,
      hypothesis: w.k,
    };
  }
  const r = rightMap[classifier];
  const echo = motherTongueEnabled ? r.echo[motherTongue] || undefined : undefined;
  return {
    text: `${r.line}${suffix}`,
    motherEcho: echo,
    suggestedSubject: sub,
    hypothesis: classifier,
  };
}
