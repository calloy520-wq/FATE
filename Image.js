// FATE 繪圖：NovelAI V5 視覺導演（中文劇情 → Danbooru 標籤）、導演結果的程式修正、繪圖 payload 組裝與生圖。
// 和 Code.js 共用 GAS 的全域空間；這個檔只放函式與「不引用其他檔案」的常數，載入順序不影響（tests/load-order.js 會檢查）。

// ==================== 5. NAI V5 專職視覺導演 & 純畫面繪圖 ====================

// NAI V4 以後的多角色規則：「1girl / 2girls / solo」這類人數標籤只放在主提示詞，
// 每個角色欄位改以 girl / boy 開頭，避免人數判斷錯亂與特徵互相污染
function normalizeCharCoreForNai_(coreStr, gender) {
  const parts = String(coreStr || '').split(',').map(x => x.trim()).filter(Boolean)
    .filter(t => !/^\d+\s*(girl|boy)s?$/i.test(t) && !/^(solo|multiple (girls|boys|characters))$/i.test(t) && !/^(girl|boy)$/i.test(t));
  return [gender === 'boy' ? 'boy' : 'girl'].concat(parts).join(', ');
}

function stripCountTags_(str) {
  return String(str || '').split(',').map(x => x.trim()).filter(Boolean)
    .filter(t => !/^\d+\s*(girl|boy)s?$/i.test(t) && !/^(solo|multiple (girls|boys|characters))$/i.test(t))
    .join(', ');
}

function resolveCharacterVisualProfile_(charId, dbInfo, statusObj, userAction, storyText, isCombat) {
  const gender = (charId === 'player_master')
    ? (statusObj.master.gender === 'boy' ? 'boy' : 'girl')
    : ((dbInfo && dbInfo.gender === 'boy') ? 'boy' : 'girl');

  const rawCore = (charId === 'player_master')
    ? String(statusObj.master.coreTags || '').trim()
    : String((dbInfo && dbInfo.coreTraits) || '').trim();

  let rawOutfit = String((statusObj.outfits && statusObj.outfits[charId]) || '').trim();
  if (!rawOutfit) {
    rawOutfit = String((dbInfo && dbInfo.defaultOutfit) || '').trim();
  }

  rawOutfit = autoAdaptSmartOutfit_(
    charId,
    rawOutfit,
    dbInfo || {},
    userAction,
    storyText,
    isCombat,
    statusObj.locationKey
  );

  const combinedUc = String((dbInfo && dbInfo.uc) || '').trim();

  return {
    gender: gender,
    core: rawCore,
    outfit: rawOutfit,
    uc: combinedUc
  };
}

// 專職 NAI V5 視覺導演／翻譯官：劇情優先換裝 + 動態場地背景 + 鏡頭語言 + 多人互動語法（不鎖定座標，交由 AI's Choice 構圖）
// 劇情摘錄：保留開頭交代與結尾（最新畫面），中間省略，避免最關鍵的結尾被截掉
// 玩家做親密動作（摸頭、擁抱、親吻…）而劇情尾端才插進威脅時，導演只看到結尾就會畫成警戒畫面、漏掉玩家的動作
// （2026-11 實測：摸頭後使魔窺探 → CG 變戴頭盔警戒，光改導演規則 flash-lite 不聽）→ 摘錄截到動作與反應為止
const GESTURE_ACTION_RE_ = /摸.{0,3}頭|摸摸|抱|擁|吻|親.{0,2}(臉|額|嘴|唇|她|他|一下)|牽.{0,2}手|膝枕|掏耳|依偎|靠在.{0,6}(肩|懷|身上)|餵/;
const GESTURE_STORY_RE_ = /摸|撫|抱|擁|吻|親|牽|膝|掏耳|依偎|靠|餵/;
const STORY_INTERRUPT_RE_ = /就在這時|就在此時|正當|突然|忽然|驀地|下一刻|使魔|殺氣|敵意|警報|窺探|偷窺|襲擊|結界傳來|結界.{0,4}擾動/;
function focusGestureExcerpt_(storyText, userAction, isCombat) {
  const t = String(storyText || '');
  if (isCombat || !GESTURE_ACTION_RE_.test(String(userAction || ''))) return t;
  const paras = t.split(/\n+/);
  const start = paras.findIndex(p => GESTURE_STORY_RE_.test(p));
  if (start < 0) return t;
  const kept = paras.slice(0, start + 1);
  if (STORY_INTERRUPT_RE_.test(paras[start])) return t;
  for (let i = start + 1; i < paras.length; i++) {
    const m = paras[i].match(STORY_INTERRUPT_RE_);
    if (m) { const head = paras[i].slice(0, m.index).trim(); if (head.length >= 4) kept.push(head); return kept.join('\n'); }
    kept.push(paras[i]);
  }
  return t;
}

// 死亡回合：系統提示詞已不要求寫死後的夢；萬一 AI 還是寫了夢境、幻覺，導演只看結尾會畫成夢境或空廢墟 → 截在夢之前（保險）
// 玩家自己找死時從者的表情：冷酷、疑問、驚訝的複雜表情（使用者在 4 種寫法中選定，不要可愛的張嘴驚訝）
const SELF_DEATH_SERVANT_FACE_ = 'wide-eyed, raised eyebrow, furrowed brow, slightly parted lips, confused, cold expression, frozen mid-gesture, one hand half raised';
// 玩家自己找死：對自己開槍、自殺、跳樓、割腕、服毒…
function isSelfInflictedDeath_(text) {
  const t = String(text || '');
  if (/毒|安眠藥/.test(t) && /喝|吞|服|吃/.test(t)) return true; // 「把毒藥一口氣喝下去」
  if (/(炸彈|炸藥|手榴彈)/.test(t) && /抱著|引爆|自爆|拉開/.test(t)) return true;
  return /自殺|自盡|自刎|了結自己|對自己|朝自己|往自己|刺向自己|太陽穴|割腕|上吊|跳樓|跳橋|跳下去|縱身躍下|咬舌|引爆自己|抹脖子|臥軌|跳河/.test(t);
}

// 死亡回合的繪圖狀態：一般死亡一律第三人稱（看得到御主倒下）；自己找死時照玩家的鏡頭設定（第一人稱＝正面看著從者的錯愕臉）
function isJumpDeath_(text) { return /跳樓|跳下|跳橋|跳河|躍下|縱身/.test(String(text || '')); }

function deathCgStatus_(statusBefore, statusAfter, userAction) {
  const selfDeath = isSelfInflictedDeath_(userAction) && Boolean((statusBefore.servant1 && statusBefore.servant1.id) || (statusAfter.servant1 && statusAfter.servant1.id));
  return { _death: true, _selfDeath: selfDeath, _jumpDeath: selfDeath && isJumpDeath_(userAction), cameraMode: selfDeath && statusBefore.cameraMode === 'pov' ? 'pov' : 'third' };
}

function deathExcerpt_(storyText) {
  const paras = String(storyText || '').replace(/【[^】]*】[^\n]*/g, '').replace(/🐯[\s\S]*$/, '').split(/\n+/).map(p => p.trim()).filter(Boolean);
  const dreamRe = /夢|幻影|幻覺|虛假|美好的|願望.{0,6}實現|聖杯.{0,6}(實現|賜予|低語)|意識.{0,4}(消散|消逝|沉入)/;
  const cut = paras.findIndex((p, i) => i > 0 && dreamRe.test(p));
  if (cut <= 0) return paras.join('\n');
  // 同一段裡死亡瞬間和美夢常寫在一起：只切掉提到夢的那一句以後
  const sentences = paras[cut].split(/(?<=[。！？])/);
  const si = sentences.findIndex(x => dreamRe.test(x));
  const head = si > 0 ? sentences.slice(0, si).join('') : '';
  return paras.slice(0, cut).concat(head ? [head] : []).join('\n');
}

function excerptForDirector_(storyText) {
  const t = String(storyText || '').replace(/【時段推進[\s\S]*$/, '').trim();
  if (t.length <= 1600) return t;
  return t.slice(0, 300) + '\n……\n' + t.slice(-1300);
}

// 各角色常見的英文稱呼：導演偶爾把別人的名字寫進某角色欄位（"standing behind Archer"），NovelAI 會因此多畫一個 Archer
const CHAR_EN_NAMES_ = {
  saber: ['saber', 'artoria', 'arturia'], saber_alter: ['saber alter', 'artoria alter'], archer: ['archer', 'emiya'],
  lancer: ['lancer', 'cu chulainn', 'cuchulainn'], rider: ['rider', 'medusa'], caster: ['caster', 'medea'],
  assassin: ['assassin', 'sasaki kojirou', 'kojirou', 'kojiro'], berserker: ['berserker', 'heracles'], gilgamesh: ['gilgamesh'],
  shirou: ['emiya shirou', 'shirou'], rin: ['tohsaka rin', 'tohsaka', 'rin'], sakura: ['matou sakura', 'sakura'], dark_sakura: ['dark sakura', 'sakura alter'],
  shinji: ['matou shinji', 'shinji'], illya: ['illyasviel', 'illya'], prisma_illya: ['illyasviel', 'illya'], kirei: ['kotomine kirei', 'kotomine', 'kirei'],
  souichirou: ['kuzuki souichirou', 'kuzuki', 'souichirou'], scathach: ['scathach'], jeanne: ['jeanne'], jalter: ['jeanne alter', 'jalter'],
  mordred: ['mordred'], okita: ['okita souji', 'okita'], tamamo: ['tamamo'], ereshkigal: ['ereshkigal'], karna: ['karna'], hassan: ['hassan'],
  chloe: ['chloe'], miyu: ['miyu']
};

// 把角色欄位裡「別人的名字」換成中性說法（自己的名字、Danbooru 角色標籤都不動）
function stripOtherCharNames_(text, selfId, presentIds, replacement) {
  const rep = replacement || 'another character';
  let out = String(text || '');
  (presentIds || []).forEach(id => {
    if (!id || id === selfId) return;
    const names = (CHAR_EN_NAMES_[id] || []).concat([String(id).replace(/_/g, ' ')]);
    if (id === CUSTOM_SERVANT_ID_ && ACTIVE_CUSTOM_SERVANT_ && /^[\x20-\x7e]+$/.test(ACTIVE_CUSTOM_SERVANT_.name)) names.push(ACTIVE_CUSTOM_SERVANT_.name);
    names.sort((a, b) => b.length - a.length).forEach(n => {
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp('\\b' + esc + '(?:\'s)?\\b(?!\\s*\\()', 'gi'), rep);
    });
  });
  return out.replace(/(another character)(\s+and\s+another character)+/gi, 'the others').replace(/the another character/gi, 'another character');
}

function translateSceneToNaiV5_(directorCtx) {
  const charSummary = (directorCtx.chars || []).map(c =>
    `- id: "${c.id}", name: "${c.name}", gender: "${c.gender}", use_np: ${Boolean(c.use_np)}, reference_outfit: "${c.referenceOutfit || ''}", battle_outfit: "${c.battleOutfit || ''}", casual_outfit: "${c.casualOutfit || ''}", hint: "${c.hint || ''}"`
  ).join('\n');

  const systemPrompt = [
    'You are an elite Visual Director & NovelAI Diffusion V5 Prompt Translator.',
    'Read the Traditional Chinese RPG story excerpt and translate the single most cinematic moment into a NovelAI V5 hybrid English prompt.',
    'RULES FOR NOVELAI V5:',
    '0. WEATHER: if a "Weather" line is given and the scene is outdoors, show it (rain, snow, fog). If no Weather line is given the sky is clear — never invent rain, snow, wet pavement or fog.',
    '1. Language: 100% ENGLISH ONLY. Combine crisp Danbooru tags with 1 short vivid English natural-language clause for mood, spatial relation, or lighting.',
    '2. OUTFIT FOLLOWS STORY FIRST (CRITICAL): "reference_outfit" is ONLY a fallback default. Always override it based on the actual scene:',
    '   - Bathing / showering / hot spring / undressing / nude scene: MUST set "is_nude": true and "outfit": "nude, completely nude, no clothes" (add "wet skin, steam" if bathing).',
    '   - Combat / fighting / ambush / night raid: MUST wear combat-ready attire (use "battle_outfit" or appropriate battle gear/armor).',
    '   - Sleeping / bed / changing clothes: Wear appropriate pajamas/nightwear or whatever the story explicitly describes.',
    '   - casual_outfit may be used ONLY when "At Home Base" is yes and Is Combat is false. Anywhere else (streets, patrol, enemy territory) Servants wear reference_outfit / battle_outfit, never casual_outfit.',
    '   - Normal scene with no outfit change: Use "reference_outfit" (translate it into clean English Danbooru tags if it is in Chinese).',
    '   - Never put hair color, eye color, body type or character names inside "outfit"; those come from a fixed character sheet.',
    '   - Reflect "Current Site Appearance/Modifications" in scene_prompt (battle damage, decorations, barriers persist between turns and must be visible).',
    '   - Servants keep their weapons dematerialized outside battle: draw a weapon ONLY when Is Combat is true or the excerpt explicitly shows the weapon being drawn or swung in that very moment. Casual talk, planning, resting, negotiating = no weapon in hand.',
    '   - The setting is Japan in 2004: any mobile phone must be a "flip phone" (clamshell feature phone with antenna and physical keypad). Never draw smartphones, touchscreens or other post-2004 technology.',
    '   - PEOPLE FIRST: the characters (faces, expressions, poses, outfits) are the subject. Props, phones, weapons and effects are minor atmosphere — never let an object dominate or fill the frame.',
    '   - NATURAL, ALIVE POSES: never a stiff, symmetrical, straight-on standing pose. Give each character specific body language that fits the moment and their personality — weight on one leg (contrapposto), head tilt, hand on hip or chin, arms behind back, leaning on something, looking over shoulder, mid-step, sitting casually; add motion (hair blowing, sway). Prefer three-quarter view or from the side, and a camera angle that adds life (slightly from below, from above, dutch angle for tension). Show a clear facial expression (smirk, gentle smile, raised eyebrow, pout, determined glare) rather than a blank stare.',
    '   - ROMANTIC MOMENTS (kiss, embrace, confession, tender touch): make it beautiful and intimate — close-up or upper body framing, the kiss must actually be visible (lips touching or about to touch), closed or half-closed eyes, blush, gentle expressions; soft lighting, warm color tone, bokeh, floating light particles, background softly blurred. Third-person kisses use "kiss" with mutual#kiss; POV uses "incoming kiss" (lips only). Use Danbooru tags for intimacy: "mimikaki" (ear cleaning), "hug from behind", "kissing cheek" (never incoming kiss for a cheek kiss), "lap pillow", "headpat", "holding hands", "forehead-to-forehead". Only make it comedic or shocked if the story clearly says so.',
    '   - FRAMING (faces are the heart of this game): pick the closest shot that still fits everyone. One character: "cowboy shot" or "upper body" (a solo Noble Phantasm: "cowboy shot, from below" with the effect filling the background). Two or three characters: "medium shot" or "cowboy shot" with faces large and clear. Use "wide shot" ONLY for four or more people, a battle where two fighters are far apart, or pure scenery with no character. Romantic or tender moments: "upper body" or "close-up". Nothing (fences, bars, glass, crowds, weapons) may stand between the camera and a face. Never put a character with their back to the camera unless the story says they turn away: two people fighting or facing each other are shot from the side ("from side", both in profile or three-quarter view) so both faces are visible — do not stack one in the foreground facing away from the camera toward the other.',
    '3. Depict the moment described at the END of the excerpt (the current state), not an earlier event. EXCEPTION — the player\'s gesture wins: if the Player Action is an intimate or emotional gesture (headpat, hug, kiss, holding hands, lap pillow, ear cleaning, comforting, feeding) and the excerpt shows it actually happening, depict THAT gesture with its reactions (blush, flustered, smiling); a threat that is only sensed, a messenger, a phone call or a closing line at the end does not replace it — only an attack actually landing in that scene does. Only include props, weapons and magic effects that the excerpt explicitly shows in that moment (do not add a character\'s signature item unless it is being used).',
    '4. Scene (scene_prompt): Do NOT include count tags (1girl, 2girls, solo, multiple characters) — they are added automatically. Describe the overall layout in one short natural-language clause WITHOUT any character name (e.g. "two figures facing off across the bridge", "a group gathered around a table"). Camera framing ("close-up", "medium shot", "wide shot", "over-the-shoulder shot", "low angle", "dutch angle") + setting + current site modifications/atmosphere + lighting. NO hair/eyes/clothes, NO text/speech bubbles.',
    '5. Characters (char_directions): For each present character output (keep every character\'s tags strictly in its own entry so features do not bleed between characters):',
    '   - "id": exact character id.',
    '   - "is_nude": boolean (true if unclothed/bathing/nude in this scene).',
    '   - "outfit": final English Danbooru clothing tags for THIS EXACT SCENE.',
    '   - "action": the character\'s placement and spatial relation FIRST (foreground / background / center, beside / behind / in front of / facing another character, near or far, above or below), then pose, expression, gaze, weapon/prop action, in English (NO hair/eyes color). Do NOT give coordinates or left/right grid positions — NovelAI decides the exact layout from these relations.',
    '   - "interaction": ONLY if 2+ characters directly interact, use NAI V5 syntax ("source#<action>" + "target#<action>", or "mutual#<action>"). Example: the one touching writes "source#hand on another\'s shoulder", the one being touched writes "target#hand on another\'s shoulder"; both hugging write "mutual#hug". Never put a name before or after "#". Empty string "" otherwise.',
    '   - NAMES STAY OUT (CRITICAL): never write another character\'s name or id inside a character\'s "action", "outfit" or "interaction", and never name characters in scene_prompt. Refer to others only as "another character", "the girl", "the man", "an ally", "the enemy". A name inside someone else\'s entry makes NovelAI draw that person twice. Relations between characters go in "interaction" with source#/target#/mutual#.',
    directorCtx.cameraMode === 'pov'
      ? 'FIRST-PERSON POV MODE: The camera IS the player\'s eyes. Never draw the player\'s face or body; the player is not in char_directions. Never draw the player\'s hands or arms (no "pov hands"): when the player touches someone (headpat, holding hands), show it only through that character\'s natural reaction. Objects the player holds (phones, papers, weapons) are never the focus — mention them briefly or not at all. Describe every character\'s placement relative to the viewer (very close to viewer, at arm\'s length, across the room, far away) and use "looking at viewer" when they address or face the player; interactions with the player use phrases like "reaching towards viewer". Frame shots as what the player sees. CHARACTER FOCUS: in POV the visible characters are the subject of the picture — frame them close (use "close-up" or "upper body" or "cowboy shot" for one character, "medium shot" for two or three) so they fill most of the frame with clear faces and expressions; keep the background simple and secondary ("depth of field", "blurry background"), showing only enough to identify the place. Use a wide shot only when no character is visible. If a character kisses the player, use "incoming kiss" with a close-up of her face (eyes closed or half-closed, blush). Never mention out-of-view characters in scene_prompt. For EVERY character also output "in_view": true/false — false when the character is outside the player\'s field of view (behind the player, beside and out of frame, behind a wall, hidden in darkness); true only if the player would actually see them right now (e.g. "leaning in from over your shoulder" counts as visible).'
      : '',
    'ORIENTATION: also output "orientation": "portrait" for one character (always, even in battle) or two characters in close interaction (kiss, embrace, face-to-face, leaning on each other); "landscape" for battles, wide scenery, three or more characters, or two characters apart.',
    'Output strictly valid JSON: { "orientation": "portrait or landscape", "scene_prompt": "...", "char_directions": [{ "id": "...", "is_nude": false, "outfit": "...", "action": "...", "interaction": "" }] }'
  ].join('\n');

  const userMsg = [
    directorCtx.isSelfDeath ? `SELF-INFLICTED DEATH (dark comedy, CRITICAL): the player suddenly killed themself out of nowhere. The SERVANT is the subject: frozen in place with a cold, puzzled, shocked, complicated expression (${SELF_DEATH_SERVANT_FACE_}) — she never saw this coming; NOT a cute or cartoonish face, no open-mouthed scream, no sweatdrop. Frame her with "upper body" or "cowboy shot", face large and clear. ${directorCtx.isJumpDeath ? (directorCtx.cameraMode === 'pov' ? 'The player just jumped: first-person view falling away from her — shot from below, she leans over the railing above, looking down at viewer.' : 'The player already jumped off: no body in the frame; she stands alone at the railing edge, turned toward the camera.') : (directorCtx.cameraMode === 'pov' ? 'First-person: she stands in front of the viewer, looking at viewer.' : 'The player master lies motionless on the ground behind her, small in frame, face hidden, no gore focus.')} Ignore the normal FATAL DEATH SCENE rule.` : '',
    directorCtx.isDeath && !directorCtx.isSelfDeath ? 'FATAL DEATH SCENE (CRITICAL): depict the exact moment the player master dies — the player master clearly visible, collapsed on the ground or falling, blood, half-closed eyes, reaching out weakly; the killer (if present) looming over or striking; dark red sky and black mud. Third-person camera. NOT a dream, NOT empty scenery, NOT a peaceful moment. Any present ally of the player looks anguished and too late — never calm or smiling.' : '',
    `Location & Time: ${directorCtx.location} (${directorCtx.timePeriod})`,
    directorCtx.weather && directorCtx.weather !== '晴' ? `Weather: ${WEATHER_TYPES_[normalizeWeather_(directorCtx.weather)].tags} (show it only if the scene is outdoors or a window is visible)` : '',
    directorCtx.locationDesc ? `Current Site Appearance/Modifications: ${directorCtx.locationDesc}` : '',
    `Is Combat: ${Boolean(directorCtx.isCombat)}`,
    `Adult Mode: ${Boolean(directorCtx.adultMode)}`,
    `Camera: ${directorCtx.cameraMode === 'pov' ? 'FIRST-PERSON POV (player is the camera)' : 'third-person'}`,
    `At Home Base: ${directorCtx.atHomeBase ? 'yes' : 'no'}`,
    `Player Action: ${directorCtx.userAction || ''}`,
    `Present Characters:\n${charSummary}`,
    `Story Excerpt (the END is the current moment):\n${excerptForDirector_(focusGestureExcerpt_(directorCtx.storyText, directorCtx.userAction, directorCtx.isCombat))}`
  ].filter(Boolean).join('\n\n');

  try {
    return callGeminiLiteJson_(systemPrompt, userMsg, 0.35, 1000);
  } catch (e) {
    return null;
  }
}

// 角色預設表情：導演或 AI 沒給表情時補上，避免面無表情的「證件照」（實測補表情後明顯生動）
const CHAR_DEFAULT_EXPRESSION_ = {
  rin: 'confident smile', sakura: 'gentle smile', dark_sakura: 'empty smile, half-closed eyes', saber: 'serious, calm expression',
  saber_alter: 'cold expression', archer: 'smirk', lancer: 'grin', rider: 'calm expression, faint smile', caster: 'smug smile',
  assassin: 'calm smile', berserker: 'angry, glowing eyes', gilgamesh: 'arrogant smirk', shirou: 'determined expression',
  shinji: 'smirk', illya: 'playful smile', kirei: 'faint smile', souichirou: 'expressionless', scathach: 'slight smile',
  jeanne: 'gentle smile', jalter: 'smug smile', mordred: 'grin', okita: 'cheerful smile', tamamo: 'playful smile',
  ereshkigal: 'pout, blush', karna: 'calm expression', hassan: 'mask', prisma_illya: 'smile', chloe: 'smirk', miyu: 'shy',
  player_master: 'light smile'
};
const EXPRESSION_TAG_RE_ = /\b(smil|smirk|grin|frown|expression|blush|angry|anger|serious|cry|crie|tear|surprise|shock|open mouth|pout|closed eyes|laugh|scowl|annoy|sad|happy|embarrass|determin|scare|nervous|glar|worr|kiss|sleep|mask|winc|panic|shout|scream|teeth|tongue|focus|calm|smug|sneer|wink|grit|concern|fear|furious|cheerful|gentle|cold|playful|shy|stern|tired|confus)\w*/i;

function defaultExpressionFor_(id, isCombat) {
  if (id === CUSTOM_SERVANT_ID_) return isCombat ? 'determined expression' : ((ACTIVE_CUSTOM_SERVANT_ && ACTIVE_CUSTOM_SERVANT_.expression) || 'light smile');
  if (isCombat && !/^(berserker|gilgamesh|hassan|dark_sakura|saber_alter)$/.test(id)) return 'determined expression';
  return CHAR_DEFAULT_EXPRESSION_[id] || 'light smile';
}

// 動作描述裡完全沒有表情字眼時，補上預設表情
function ensureExpression_(actionStr, expr) {
  const a = String(actionStr || '').trim();
  if (!expr || EXPRESSION_TAG_RE_.test(a)) return a;
  return a ? `${a}, ${expr}` : expr;
}

// 夜景沒有其他光源時，整張會被染成藍色霓虹、人物膚色發青；補一點暖色環境光（實測膚色恢復正常）
function addNightFillLight_(prompt) {
  let p = String(prompt || '');
  // 黃昏：導演常寫 orange-hued lighting，整張連人物都被染成橘色 → 改成暖光並保留膚色
  if (/\b(sunset|golden hour|dusk|twilight|evening)\b/i.test(p)) {
    p = p.replace(/\b(orange|amber)[- ]hued (lighting|light|glow)/gi, 'warm lighting').replace(/,\s*orange[- ]hued sky/gi, ', orange sky');
    if (!/natural skin tone/i.test(p)) p = `${p}, natural skin tone, soft lighting`;
    return p;
  }
  if (!/\b(night|midnight|night sky|dark)\b/i.test(p)) return p;
  if (/\b(warm|lamp|lantern|street ?lights?|candle|fire|bonfire|sunset|sunrise|natural skin tone)\b/i.test(p)) return p;
  return p ? `${p}, warm ambient light, natural skin tone` : p;
}

function buildNaiPayloadFromScene_(statusObj, presentChars, sceneEnvEn, isCombat, userAction, storyText, turnNum) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const charDb = getCharAppearanceMap_(ss);

  // 第一人稱：鏡頭就是御主的眼睛，畫面中不畫御主本人
  const povMode = statusObj.cameraMode === 'pov';
  // 一張圖最多 3 人：尺寸固定，4 人以上每張臉太小、容易畫歪或把同一人畫兩次；超過時先省略御主（多半站在後方）
  const MAX_CG_CHARS = 3;
  let validChars = presentChars.filter(c => c && charDb[c.id] && !(povMode && c.id === 'player_master'));
  if (validChars.length > MAX_CG_CHARS) {
    // 保留順序：自己的從者（主／副）→ 正在解放寶具的 → 其他人照 AI 列出的順序；御主最先省略
    const own = new Set([statusObj.servant1 && statusObj.servant1.id, statusObj.servant2 && statusObj.servant2.id].filter(Boolean));
    // 玩家這回合跟人有肢體接觸（牽手、擁抱、親吻…）時御主要留在畫面，否則牽手會變成跟別人牽（實測斯卡哈牽著慎二）
    const masterTouching = /牽|抱|吻|親|摸|握|靠|依偎|膝枕|撒嬌|挽|摟|貼|掏耳|耳朵|躺|枕|餵|按摩|揉|梳頭|梳髮|擦|背我|揹/.test(String(userAction || ''));
    const rank = c => (own.has(c.id) ? 0 : (c.id === 'player_master' ? 0.5 : (c.use_np ? 1 : 2)));
    validChars = validChars.filter(c => masterTouching || statusObj._death || c.id !== 'player_master')
      .map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(x => x.c);
  }
  validChars = validChars.slice(0, MAX_CG_CHARS);
  let girls = 0;
  let boys = 0;
  let anyNpActive = false;
  let anyNude = false;

  const charSlots = validChars.map((c, idx) => {
    const dbInfo = charDb[c.id] || {};
    const profile = resolveCharacterVisualProfile_(c.id, dbInfo, statusObj, userAction, storyText, isCombat);

    const wantsNude = isNudeOutfitTags_(profile.outfit) || /全裸|裸體|沒穿|赤裸|一絲不掛|\b(nude|naked|no clothes|topless)\b/i.test(String(c.action_en || ''));
    if (wantsNude && !isNudeOutfitTags_(profile.outfit)) profile.outfit = 'nude, completely nude, no clothes';
    // 全裸把關在獨立的 NudeGuard.js（不會推上 GAS）：有那個檔案才套用
    if (typeof sanitizeNudeOutfitForChar_ === 'function') profile.outfit = sanitizeNudeOutfitForChar_(c.id, profile.outfit, Boolean(statusObj.adultMode), dbInfo.defaultOutfit);
    // 成人模式關閉：依場合換成浴巾／被子／便服（獨立於角色把關）
    if (!statusObj.adultMode) profile.outfit = adultOffOutfit_(profile.outfit, `${userAction || ''} ${storyText || ''} ${sceneEnvEn || ''} ${c.action_en || ''}`, dbInfo.defaultOutfit);
    const nudeMode = isNudeOutfitTags_(profile.outfit);
    const normCore = normalizeCharCoreForNai_(profile.core, profile.gender);
    const core = nudeMode ? stripClothesFromCore_(normCore) : normCore;
    if (nudeMode) anyNude = true;
    // 服裝裡不能有自己負面排除的東西（例如 Rider 的眼罩）
    const weightedOutfit = stripActionTermsInUc_(formatCharacterOutfitPrompt_(profile.outfit), profile.uc);
    let directAction = String(c.action_en || '').trim();

    if (profile.gender === 'boy') boys++;
    else girls++;

    let npBoost = '';
    const npVisual = c.id === CUSTOM_SERVANT_ID_ ? ((ACTIVE_CUSTOM_SERVANT_ && ACTIVE_CUSTOM_SERVANT_.npVisual) || 'noble phantasm, overwhelming magic energy, glowing aura') : NP_VISUAL_EFFECTS_[c.id];
    if (c.use_np && npVisual) {
      npBoost = npVisual;
      anyNpActive = true;
    }

    // 非戰鬥、沒有解放寶具時，武器不出現在畫面上（劇情就算寫了也不畫）
    const noWeaponUc = (!isCombat && !c.use_np && c.id !== 'player_master') ? 'holding weapon, weapon, spear, polearm, sword' : '';
    if (noWeaponUc) directAction = stripWeaponTags_(directAction);
    const defaultExpression = nudeMode ? '' : defaultExpressionFor_(c.id, Boolean(isCombat || c.use_np));
    directAction = ensureExpression_(directAction, defaultExpression);
    return {
      id: c.id,
      defaultExpression: defaultExpression,
      baseCore: normCore,
      weightedOutfit: weightedOutfit,
      npBoost: npBoost,
      prompt: [core, weightedOutfit, directAction, npBoost].filter(Boolean).join(', '),
      uc: [profile.uc, noWeaponUc].filter(Boolean).join(', '),
      gender: profile.gender,
      x: 0.5,
      y: 0.5
    };
  });

  // 多人同場時，把「其他角色的髮色」加進每個角色的負面提示詞，降低特徵互相污染（例如御主被染成斯卡哈的紫髮）
  const HAIR_COLOR_RE = /\b(black|white|silver|blonde|purple|red|blue|pink|orange|brown|grey|gray|green|aqua)\s+hair\b/gi;
  const hairOf = slot => (String(slot.baseCore || '').match(HAIR_COLOR_RE) || []).map(x => x.toLowerCase());
  if (charSlots.length > 1) {
    charSlots.forEach(slot => {
      const own = new Set(hairOf(slot));
      const others = [];
      charSlots.forEach(o => { if (o !== slot) hairOf(o).forEach(h => { if (!own.has(h) && others.indexOf(h) === -1) others.push(h); }); });
      if (others.length > 0) slot.uc = [slot.uc, others.join(', ')].filter(Boolean).join(', ');
    });
    // 同時把每個角色自己的髮色加權，貼身互動（親吻、擁抱）時也不容易被染色
    charSlots.forEach(slot => {
      const boost = str => String(str || '').replace(/(^|,\s*)((?:[a-z]+ )*(?:black|white|silver|blonde|purple|red|blue|pink|orange|brown|grey|gray|green|aqua) hair)(?=\s*,|$)/gi, (m0, sep, tag) => `${sep}1.25::${tag}::`);
      slot.baseCore = boost(slot.baseCore);
      slot.prompt = boost(slot.prompt);
    });
  }

  const countTags = [];
  if (girls === 1) countTags.push('1girl');
  else if (girls > 1) countTags.push(`${girls}girls`);
  if (boys === 1) countTags.push('1boy');
  else if (boys > 1) countTags.push(`${boys}boys`);
  if (girls + boys === 1) countTags.push('solo');
  else if (girls + boys > 1) countTags.push('multiple characters');
  if (povMode) {
    if (girls + boys === 0) countTags.push('no humans', 'scenery');
    countTags.push('pov', 'first-person view');
    if (girls + boys > 0) countTags.push('depth of field');
  }

  const combatEnvTags = (isCombat || anyNpActive)
    ? 'dynamic action, magic energy sparks, motion blur, dramatic rim lighting'
    : '';

  // 成人模式開啟且畫面有裸露時，主提示詞補上 nsfw（V4 以後的模型沒有這個標籤時常會自動補衣服或遮擋）
  const adultMode = Boolean(statusObj.adultMode);
  const ratingTag = (adultMode && anyNude) ? 'nsfw' : '';
  const finalScenePrompt = [...countTags, ratingTag, stripCountTags_(sceneEnvEn), combatEnvTags].filter(Boolean).join(', ');

  return {
    prompt: finalScenePrompt,
    countPrefix: countTags.join(', '),
    weather: normalizeWeather_(statusObj.weather),
    adultMode: adultMode,
    cameraMode: povMode ? 'pov' : 'third',
    combatEnvTags: combatEnvTags,
    artStyle: statusObj.artStyle || 'official',
    characters: charSlots,
    width: pickNaiSize_(charSlots.length).width,
    height: pickNaiSize_(charSlots.length).height,
    steps: 28,
    scale: 5.0,
    cfgRescale: 0.25,
    sampler: 'k_euler_ancestral',
    noiseSchedule: 'karras',
    model: 'nai-diffusion-5-full',
    autoQuality: true,
    _player: statusObj.playerName || '',
    _turn: (turnNum !== undefined && turnNum !== null) ? Number(turnNum) : null,
    _directorContext: {
      location: statusObj.location || '',
      locationDesc: (statusObj.locationInfo && statusObj.locationInfo.desc) ? String(statusObj.locationInfo.desc) : '',
      timePeriod: statusObj.timePeriod || '',
      weather: normalizeWeather_(statusObj.weather),
      isCombat: Boolean(isCombat || anyNpActive),
      isDeath: Boolean(statusObj._death),
      isSelfDeath: Boolean(statusObj._selfDeath),
      isJumpDeath: Boolean(statusObj._jumpDeath),
      adultMode: adultMode,
      cameraMode: povMode ? 'pov' : 'third',
      atHomeBase: statusObj.locationKey === '廢棄洋館',
      userAction: String(userAction || ''),
      storyText: statusObj._death ? deathExcerpt_(storyText) : String(storyText || ''),
      chars: validChars.map((c, idx) => {
        const dbInfo = charDb[c.id] || {};
        const refOutfit = String((statusObj.outfits && statusObj.outfits[c.id]) || dbInfo.defaultOutfit || '').trim();
        return {
          id: c.id,
          name: dbInfo.triggers ? dbInfo.triggers.split(',')[0] : c.id,
          gender: charSlots[idx].gender,
          use_np: Boolean(c.use_np),
          referenceOutfit: refOutfit,
          // 御主沒有「戰鬥服」：用玩家自己設定的服裝（實測開戰時克勞德被換成 GameData 預設的黑色毛衣）
          battleOutfit: c.id === 'player_master' ? refOutfit : String(dbInfo.defaultOutfit || refOutfit).trim(),
          casualOutfit: String(dbInfo.casualOutfit || '').trim(),
          hint: String(c.action_en || '')
        };
      })
    }
  };
}

// NovelAI 的互動語法只認 source# / target# / mutual# 三種前綴；其他「xxx#」前綴（例如角色名#）會被當成雜訊，直接去掉前綴保留動作
function stripBadInteractionPrefix_(str) {
  return String(str || '').split(',').map(t => t.trim()).filter(Boolean)
    .map(t => {
      if (/^(source|target|mutual)#[^#]*$/i.test(t)) return t;
      // 導演常寫成「名字#動作#對象」（archer#protecting#rin）→ 轉成 NovelAI 認得的 source#動作
      const tri = t.match(/^(?:(source|target|mutual)#)?[^#]{1,40}#([^#]+)#[^#]{1,40}$/i);
      if (tri) return `${(tri[1] || 'source').toLowerCase()}#${tri[2].replace(/_/g, ' ').trim()}`;
      // 「動作#對象」（protective_hand_on_shoulder#rin，前半是多字動作）→ source#動作
      const duo = t.match(/^([^#]{1,60})#([^#]{1,40})$/);
      if (duo && /[_ ]/.test(duo[1].trim())) return `source#${duo[1].replace(/_/g, ' ').trim()}`;
      // 其他不認得的前綴（多半是名字，可能好幾層）全部去掉，只留動作
      let r = t;
      while (/^[^\s#,]{1,40}#/.test(r) && !/^(source|target|mutual)#/i.test(r)) r = r.replace(/^[^\s#,]{1,40}#/, '');
      return r.replace(/_/g, ' ');
    })
    .filter(Boolean)
    .join(', ');
}

function sanitizeNaiInteraction_(str) {
  return stripBadInteractionPrefix_(str);
}

// 第一人稱視野判斷：Gemini 有時把 in_view 寫進文字、或寫了「站在身後」卻標成看得到，所以程式端再判斷一次
function isOutOfPovView_(d) {
  const text = `${d.action || ''} ${d.interaction || ''}`.toLowerCase();
  if (d.in_view === false || String(d.in_view).toLowerCase() === 'false' || /in_view\s*[:=]\s*false/.test(text)) return true;
  // 站在身後的人就算「看著你」也看不到；只有從肩膀探頭、湊過來、出現在面前才算看得到
  const visibleHint = /over (the |your |viewer'?s )?shoulder|leaning (in|over|towards)|peeking|in front of (the )?viewer/.test(text);
  const hiddenHint = /behind (the )?viewer|behind the player|behind you|out of (frame|view|sight)|off-?screen|unseen|hidden from view/.test(text);
  return hiddenHint && !visibleHint;
}

// 從場景描述中移除提到指定角色的片段（以逗號分段；比對角色 ID 與英文名常見寫法）
function removeCharacterMentions_(scenePrompt, ids, ctxChars) {
  const needles = [];
  (ids || []).forEach(id => {
    needles.push(String(id).toLowerCase().replace(/_/g, ' '));
    const c = (ctxChars || []).find(x => x.id === id);
    if (c && c.name) needles.push(String(c.name).toLowerCase());
  });
  const extra = { lancer: ['cu chulainn', 'cú chulainn'], saber: ['artoria'], archer: ['emiya'], rider: ['medusa'], caster: ['medea'], assassin: ['kojirou', 'kojiro'], berserker: ['heracles'], rin: ['tohsaka'], hassan: ['hassan'] };
  (ids || []).forEach(id => (extra[id] || []).forEach(n => needles.push(n)));
  return String(scenePrompt || '').split(',').map(t => t.trim())
    .filter(t => t && !needles.some(n => n && t.toLowerCase().includes(n)))
    .join(', ');
}

// 自動選擇畫面方向：只有 1 個角色時用直式（角色更大、細節更多），2 人以上或純風景用橫式
// 兩種尺寸像素量相同（約 101 萬），都在 Opus 免費範圍內
function pickNaiSize_(charCount) {
  return Number(charCount) === 1 ? { width: 832, height: 1216 } : { width: 1216, height: 832 };
}

// 依實際畫進畫面的角色重算人數標籤（第一人稱會濾掉視野外的角色）
function buildCountTags_(chars, povMode) {
  let girls = 0;
  let boys = 0;
  (chars || []).forEach(c => { if (c.gender === 'boy') boys++; else girls++; });
  const tags = [];
  if (girls === 1) tags.push('1girl');
  else if (girls > 1) tags.push(`${girls}girls`);
  if (boys === 1) tags.push('1boy');
  else if (boys > 1) tags.push(`${boys}boys`);
  if (girls + boys === 1) tags.push('solo');
  else if (girls + boys > 1) tags.push('multiple characters');
  if (povMode) {
    if (girls + boys === 0) tags.push('no humans', 'scenery');
    tags.push('pov', 'first-person view');
    if (girls + boys > 0) tags.push('depth of field');
  }
  return tags;
}

// 兩組服裝 tags 的相似度（重疊 tag 比例），用來判斷導演是不是把服裝改回了戰鬥裝
function outfitSimilarity_(a, b) {
  const ta = String(a || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const tb = new Set(String(b || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean));
  if (ta.length === 0 || tb.size === 0) return 0;
  return ta.filter(t => tb.has(t)).length / Math.min(ta.length, tb.size);
}

// 導演文字的最後修正：視線方向、擁抱／親吻構圖（NovelAI 對自然語言的「別過頭」常會畫成看鏡頭）
const AVERTED_GAZE_RE_ = /\b(looking away|looking to the side|looking down|looking out|looking back|averting (her|his|their) (gaze|eyes)|averted gaze|eyes closed|closed eyes|looking at another character|looking at the other|looking towards the window|looking up at another)\b/i;
function refineGazeAction_(action) {
  let a = String(action || '');
  a = a.replace(/looking away from (the )?viewer/gi, 'looking away, looking to the side').replace(/away from (the )?viewer/gi, 'away');
  const averted = AVERTED_GAZE_RE_.test(a) && !/\blooking at viewer\b/i.test(a);
  return { action: a, averted: averted };
}
function isRomanticInteraction_(text) {
  return /\b(hug|hugging|embrace|embracing|kiss|kissing|cuddl)/i.test(String(text || ''));
}
function refineRomanceFraming_(scenePrompt) {
  let p = String(scenePrompt || '');
  if (!/\b(upper body|close-up|portrait)\b/i.test(p)) p = `upper body, ${p}`;
  return p.replace(/,?\s*\b(medium shot|wide shot|full body|long shot|cowboy shot)\b/gi, '').replace(/^,\s*/, '');
}

// 鏡頭字眼換成 NovelAI 認得的 Danbooru 標籤：medium shot 不是 Danbooru 標籤，1～2 人時常被畫成全身遠景（實測小次郎在山門只剩小人）
function refineFramingTags_(prompt, nChars) {
  let p = String(prompt || '');
  if (nChars >= 1 && nChars <= 2 && !/\b(cowboy shot|upper body|close-up|portrait)\b/i.test(p)) p = p.replace(/\bmedium shot\b/i, 'cowboy shot');
  return p;
}

// 親密動作 → NovelAI 熟悉的 Danbooru 標籤（自然語言的「從背後抱」「親臉頰」常被畫成並肩站、親嘴）
// 第一人稱膝枕／掏耳朵的構圖標籤（躺在她腿上往上看）
// 膝枕：2026-11 比對 12 種寫法後用「仰角＋大腿＋胸部＋臉＋天花板＋特寫」（使用者的點子，膝枕感最清楚；breasts 已拿掉，因為會套用到孩童外觀角色）；掏耳朵用俯身靠近版（使用者覺得沒問題）
let LAP_POV_TAGS_ = 'lap pillow, pov, lying, from below, looking down at viewer, 0.8::thighs::, face focus, ceiling, close-up';
// 第三人稱膝枕（看得到御主躺在她腿上）
let LAP_3RD_TAGS_ = 'lap pillow, from above, close-up, upper body, face focus';
let MIMIKAKI_POV_TAGS_ = 'mimikaki, holding ear pick, lap pillow, pov, from below, looking down at viewer, leaning over viewer, hair hanging down, face close to viewer, upper body, ceiling, 0.6::thighs::';
const INTIMACY_TAGS_ = [
  { re: /\b(hug(ging|s|ged)?|embrac(e|ing|ed)|arms wrapped around)\b[^,]*\bfrom behind\b|\bback hug\b|\bbeing hugged from behind\b/i, tag: 'hug from behind' },
  { re: /\bkiss(ing|es)? (on )?(the |her |his |another character's |the other character's |viewer's |the viewer's )?cheek\b|\bcheek kiss\b|\blips touching [^,]*cheek\b/i, tag: 'kissing cheek', cheek: true },
  { re: /\b(mimikaki|ear ?cleaning|cleaning [^,]*ears?|ear ?pick)\b/i, tag: 'mimikaki, holding ear pick' },
  { re: /\b(lap pillow|head (resting )?on [^,]*lap|lying [^,]*on [^,]*lap)\b/i, tag: 'lap pillow' },
  { re: /\b(patting|pats?|stroking|rubbing|ruffling) [^,]*head\b|\bheadpat\b/i, tag: 'headpat' },
  { re: /\bforehead (to|against) forehead\b|\bforeheads? (pressed|touching)\b/i, tag: 'forehead-to-forehead' },
  { re: /\bholding hands\b|\bhand in hand\b|\binterlocked fingers\b/i, tag: 'holding hands' },
  { re: /(^|[\s,#])(hug|hugging|embracing (the )?viewer)\b(?! from behind)/i, tag: 'hug' }
];
function detectIntimacyTags_(texts) {
  const joined = (texts || []).join(' , ');
  const hits = INTIMACY_TAGS_.filter(t => t.re.test(joined));
  // 從背後抱已經涵蓋一般擁抱，不再重複加 hug
  return hits.some(t => t.tag === 'hug from behind') ? hits.filter(t => t.tag !== 'hug') : hits;
}

// 上半身／特寫鏡頭時拿掉下半身衣物標籤：服裝欄位加權寫了長裙、褲襪、靴子時，NovelAI 會為了畫出它們而拉成全身（實測櫻哭泣怎樣都是全身）
const LOWER_BODY_RE_ = /\b(skirt|miniskirt|pleated skirt|long skirt|hakama|pants|trousers|jeans|shorts|pantyhose|tights|thighhighs|thigh highs|kneehighs|socks|stockings|leggings|garter( belt| straps)?|shoes|boots|heels|high heels|sandals|loafers|sneakers|footwear|geta|zettai ryouiki)\b/i;
const FOOTWEAR_RE_ = /\b(shoes|boots|armored boots|heels|high heels|sandals|loafers|sneakers|footwear|geta)\b/i;
// 刪掉符合條件的標籤，同時保住 1.15::…:: 這類權重語法的開頭與結尾
function removeTagsKeepWeights_(str, shouldRemove) {
  const tokens = String(str || '').split(',');
  const out = [];
  let carryPrefix = '';
  tokens.forEach(raw => {
    let t = raw.trim();
    if (!t) return;
    const pre = (t.match(/^(-?\d+(\.\d+)?::)/) || [''])[0];
    const suf = /::$/.test(t) && !/^-?\d+(\.\d+)?::$/.test(t) ? '::' : '';
    const core = t.slice(pre.length, suf ? t.length - 2 : t.length).trim();
    if (core && shouldRemove(core)) {
      if (pre) carryPrefix = carryPrefix || pre;
      if (suf) {
        if (carryPrefix) carryPrefix = ''; // 整段加權都被拿掉了
        else if (out.length) out[out.length - 1] = out[out.length - 1] + '::';
      }
      return;
    }
    if (carryPrefix) { t = carryPrefix + t; carryPrefix = ''; }
    out.push(t);
  });
  return out.join(', ');
}

function stripLowerBodyForCloseUp_(charPrompt, footwearOnly) {
  const re = footwearOnly ? FOOTWEAR_RE_ : LOWER_BODY_RE_;
  return removeTagsKeepWeights_(charPrompt, core => re.test(core) && !/\b(hair|eyes)\b/i.test(core));
}

// 角色負面裡排除的東西，不能出現在她自己的動作描述裡（實測：劇情照原作寫 Rider「被眼罩覆蓋的雙眼」，導演就把 blindfold 寫進動作，負面擋不住）
function stripActionTermsInUc_(actionStr, ucStr) {
  const terms = String(ucStr || '').replace(/-?\d+(\.\d+)?::/g, '').replace(/::/g, '').split(',').map(t => t.trim().toLowerCase()).filter(t => t.length >= 3);
  if (!terms.length) return String(actionStr || '');
  return removeTagsKeepWeights_(actionStr, core => {
    const low = core.toLowerCase();
    return terms.some(term => new RegExp('(^|[^a-z])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(low));
  });
}

function generateTurnCgAsync(imgPayload) {
  if (!imgPayload) throw new Error('無場景資料');
  const working = JSON.parse(JSON.stringify(imgPayload));
  let directedApplied = false;

  if (working._directorContext) {
    const directed = translateSceneToNaiV5_(working._directorContext);
    if (directed) {
      directedApplied = true;
      if (working.cameraMode === 'pov' && Array.isArray(directed.char_directions) && Array.isArray(working.characters)) {
        const outOfView = new Set(directed.char_directions.filter(d => d && d.id && isOutOfPovView_(d)).map(d => d.id));
        if (outOfView.size > 0) {
          working.characters = working.characters.filter(ch => !outOfView.has(ch.id));
          working.countPrefix = buildCountTags_(working.characters, true).join(', ');
          const newSize = pickNaiSize_(working.characters.length);
          working.width = newSize.width;
          working.height = newSize.height;
          if (directed.scene_prompt) {
            directed.scene_prompt = removeCharacterMentions_(directed.scene_prompt, Array.from(outOfView), (working._directorContext || {}).chars || []);
          }
          if (!directed.scene_prompt) {
            const restTags = stripCountTags_(working.prompt).split(',').map(t => t.trim())
              .filter(t => t && !/^(pov|first-person view|no humans|scenery)$/i.test(t)).join(', ');
            working.prompt = [working.countPrefix, restTags].filter(Boolean).join(', ');
          }
        }
      }
      // 導演決定畫面方向（兩種尺寸像素量相同，都在免費範圍）
      // 只有 1 個角色時一律直式：橫式會把單人畫得很小（實測黑櫻在橫式大空洞裡只剩一個小點）
      const nChars = Array.isArray(working.characters) ? working.characters.length : 0;
      if (nChars === 1 || (directed.orientation === 'portrait' && nChars <= 2)) {
        working.width = 832; working.height = 1216;
      } else if (directed.orientation === 'landscape') {
        working.width = 1216; working.height = 832;
      }
      // 全裸把關在獨立的 NudeGuard.js（不會推上 GAS）：有那個檔案才檢查導演回報的裸露
      if (typeof sanitizeNudeOutfitForChar_ === 'function' && Array.isArray(directed.char_directions)) {
        directed.char_directions.forEach(d => {
          if (!d || !d.id) return;
          const wants = Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit);
          if (!wants) return;
          const ctxC = ((working._directorContext || {}).chars || []).find(x => x.id === d.id) || {};
          const safe = sanitizeNudeOutfitForChar_(d.id, 'nude, completely nude, no clothes', Boolean(working.adultMode), ctxC.referenceOutfit && !isNudeOutfitTags_(ctxC.referenceOutfit) ? ctxC.referenceOutfit : ctxC.battleOutfit);
          if (!isNudeOutfitTags_(safe)) { d.is_nude = false; d.outfit = safe; }
        });
      }
      // 成人模式關閉：導演回報的裸露換成通用遮擋（獨立於角色把關，排在把關之後）
      if (!working.adultMode && Array.isArray(directed.char_directions)) {
        const ctxAll = `${(working._directorContext || {}).userAction || ''} ${(working._directorContext || {}).storyText || ''} ${directed.scene_prompt || ''}`;
        directed.char_directions.forEach(d => {
          if (!d || !d.id || !(Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit))) return;
          const ctxC = ((working._directorContext || {}).chars || []).find(x => x.id === d.id) || {};
          const fb = ctxC.referenceOutfit && !isNudeOutfitTags_(ctxC.referenceOutfit) ? ctxC.referenceOutfit : ctxC.battleOutfit;
          d.is_nude = false;
          d.outfit = adultOffOutfit_('nude, completely nude, no clothes', `${ctxAll} ${d.action || ''}`, fb);
        });
      }
      const directedNude = Array.isArray(directed.char_directions) && directed.char_directions.some(d => d && (Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit)));
      const alreadyNude = /(^|,\s*)nsfw(\s*,|$)/.test(String(working.prompt || ''));
      const ratingTag = (working.adultMode && (directedNude || alreadyNude)) ? 'nsfw' : '';
      // 畫面上沒有人裸露時，場景描述也不能殘留裸露字眼
      if (!directedNude && directed.scene_prompt) {
        directed.scene_prompt = String(directed.scene_prompt).split(',').map(t => t.trim())
          .filter(t => t && !isNudeOutfitTags_(t) && !/^(nsfw|bare skin|nipples|pussy|breasts out)$/i.test(t)).join(', ');
      }
      // 第一人稱一律不畫玩家的手（使用者決定：手每次畫得都不一樣，還會借旁邊角色的袖子；摸頭、牽手交給角色自然反應）
      if (directed.scene_prompt && working.cameraMode === 'pov') {
        directed.scene_prompt = String(directed.scene_prompt).split(',').map(t => t.trim()).filter(t => t && !/^pov hands?$/i.test(t)).join(', ');
      }
      if (directed.scene_prompt) {
        // 主提示詞也不放角色名字（名字只該出現在該角色自己的欄位）
        directed.scene_prompt = stripOtherCharNames_(directed.scene_prompt, '', (working.characters || []).map(x => x.id), 'a figure');
        working.prompt = [working.countPrefix, ratingTag, stripCountTags_(directed.scene_prompt), working.combatEnvTags].filter(Boolean).join(', ');
      } else if (ratingTag && !alreadyNude) {
        working.prompt = [working.countPrefix, ratingTag, stripCountTags_(working.prompt)].filter(Boolean).join(', ');
      }
      if (Array.isArray(directed.char_directions) && Array.isArray(working.characters)) {
        const dirMap = {};
        directed.char_directions.forEach(d => { if (d && d.id) dirMap[d.id] = d; });

        working.characters = working.characters.map(ch => {
          const d = dirMap[ch.id];
          if (!d) return ch;

          const ctxChar = ((working._directorContext || {}).chars || []).find(x => x.id === ch.id) || {};
          const ctxInfo = working._directorContext || {};
          const atHomeCalm = ctxInfo.atHomeBase && !ctxInfo.isCombat;
          if (atHomeCalm && ctxChar.casualOutfit && ctxChar.referenceOutfit === ctxChar.casualOutfit && d.outfit && outfitSimilarity_(d.outfit, ctxChar.battleOutfit) >= 0.5) {
            d.outfit = ctxChar.casualOutfit;
          }
          const isNude = Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit);
          const finalCore = isNude ? stripClothesFromCore_(ch.baseCore) : ch.baseCore;
          const finalOutfit = d.outfit
            ? formatCharacterOutfitPrompt_(isNude ? 'nude, completely nude, no clothes' : d.outfit)
            : ch.weightedOutfit;

          const calmScene = !((working._directorContext || {}).isCombat) && !d.use_np && ch.id !== 'player_master';
          const actionParts = [sanitizeNaiInteraction_(d.interaction), calmScene ? stripWeaponTags_(stripBadInteractionPrefix_(d.action)) : stripBadInteractionPrefix_(d.action)].filter(Boolean).join(', ')
            .split(',').map(t => t.trim()).filter(t => t && !/^in[ _]view\s*[:=]/i.test(t)).join(', ');

          const actionWithExpr = isNude ? actionParts : ensureExpression_(actionParts, ch.defaultExpression || '');
          const presentIds = working.characters.map(x => x.id).concat(((working._directorContext || {}).chars || []).map(x => x.id));
          const gaze = refineGazeAction_(stripOtherCharNames_(actionWithExpr, ch.id, presentIds).replace(/\bmutual#embrac(e|ing)\b/gi, 'mutual#hug'));
          // 視線不看鏡頭時，這個角色的負面加 looking at viewer（否則 NovelAI 很容易讓她直視鏡頭）
          const gazeUc = gaze.averted && !/looking at viewer/i.test(String(ch.uc || '')) ? 'looking at viewer' : '';
          const finalUc = [ch.uc, gazeUc].filter(Boolean).join(', ');
          return Object.assign({}, ch, {
            prompt: [finalCore, stripActionTermsInUc_(finalOutfit, finalUc), stripActionTermsInUc_(gaze.action, finalUc), ch.npBoost].filter(Boolean).join(', '),
            uc: finalUc
          });
        });
      }
      // 親密動作補上 Danbooru 標籤（主提示詞），親臉頰不當成親嘴
      const intimacy = Array.isArray(directed.char_directions)
        ? detectIntimacyTags_(directed.char_directions.map(d => `${(d && d.interaction) || ''} , ${(d && d.action) || ''}`))
        : [];
      const cheekKiss = intimacy.some(t => t.cheek);
      if (cheekKiss && Array.isArray(working.characters)) {
        working.characters = working.characters.map(ch => Object.assign({}, ch, { prompt: String(ch.prompt || '').replace(/,\s*(source#|target#|mutual#)?incoming kiss\b/gi, '').replace(/,\s*puckered lips\b/gi, '') }));
        working.prompt = String(working.prompt || '').replace(/,\s*incoming kiss\b/gi, '');
      }
      intimacy.forEach(t => {
        // 第一人稱親臉頰：畫面裡看不到自己的臉，改成她從側面湊近、閉眼
        let tag = (t.cheek && working.cameraMode === 'pov') ? 'from side, face focus, leaning in, closed eyes, blush' : t.tag;
        // 第一人稱膝枕：鏡頭是躺在她腿上的你 → 從下往上看，她低頭看著你；摸頭同理（她的手伸向鏡頭上方）
        // 第一人稱掏耳朵：躺在腿上側著頭，她從上方低頭、手拿耳挖
        if (working.cameraMode === 'pov' && t.tag.indexOf('mimikaki') === 0) tag = MIMIKAKI_POV_TAGS_;
        if (working.cameraMode === 'pov' && t.tag === 'lap pillow') tag = LAP_POV_TAGS_;
        if (working.cameraMode !== 'pov' && t.tag === 'lap pillow') tag = LAP_3RD_TAGS_;
        // 第一人稱擁抱：站著迎面抱過來才用 incoming hug；躺著／在床上用 incoming hug 會畫出頭和身體斷開的怪圖（實測）
        if (working.cameraMode === 'pov' && t.tag === 'hug') {
          const lyingHug = (directed.char_directions || []).some(d => d && /\b(lying|on the bed|in bed|on top of|resting (her|his) (head|face)|face resting|head on (the )?viewer|futon)\b/i.test(`${d.action || ''} ${d.interaction || ''}`)) || /\b(bed|futon|lying)\b/i.test(String(directed.scene_prompt || ''));
          tag = lyingHug ? 'hug, lying, from above, upper body' : 'incoming hug, close-up, face focus';
        }
        // 第一人稱摸頭、牽手不加標籤：這兩個標籤會讓 NovelAI 畫出一隻手，或改讓旁邊的人去摸（實測 3/3 是凜在摸莉莉）
        if (working.cameraMode === 'pov' && (t.tag === 'headpat' || t.tag === 'holding hands')) return;
        if (!new RegExp('\\b' + tag.split(',')[0].replace(/[-]/g, '\\-') + '\\b', 'i').test(working.prompt)) working.prompt = `${working.prompt}, ${tag}`;
      });
      // 第一人稱不畫玩家的手：角色欄位拿掉摸頭、牽手等會生出手的字眼，主負面排除手（使用者在比較圖後選擇「正常發揮比較自然」，不另外補反應標籤）
      if (working.cameraMode === 'pov') {
        const handRe = /^(source#|target#|mutual#)?(headpat|patting head|petting|head pat|holding hands|hand holding|pov hands?|hand on (another's )?head|reaching towards viewer)$/i;
        working.prompt = String(working.prompt || '').split(',').map(x => x.trim()).filter(x => x && !handRe.test(x)).join(', ');
        if (Array.isArray(working.characters)) {
          working.characters = working.characters.map(ch => Object.assign({}, ch, { prompt: removeTagsKeepWeights_(String(ch.prompt || ''), x => handRe.test(x.trim())) }));
        }
        working.uc = [working.uc, 'pov hands, disembodied hand, headpat, holding hands'].filter(Boolean).join(', ');
      }
      // 第一人稱：畫面裡沒有可以當「對象」的角色，source#／target#／mutual# 前綴會讓 incoming kiss 這類動作失效 → 去掉前綴
      if (working.cameraMode === 'pov' && Array.isArray(working.characters)) {
        working.characters = working.characters.map(ch => Object.assign({}, ch, { prompt: String(ch.prompt || '').replace(/(^|,\s*)(source|target|mutual)#/gi, '$1') }));
        // 導演有時寫「kissing viewer」「kiss」而不是 incoming kiss → 統一成 incoming kiss（親臉頰除外）
        if (!cheekKiss) {
          working.characters = working.characters.map(ch => {
            const p0 = String(ch.prompt || '');
            if (/\bincoming kiss\b/i.test(p0) || !/\bkiss(es|ing)?\b/i.test(p0)) return ch;
            return Object.assign({}, ch, { prompt: `${p0}, incoming kiss` });
          });
        }
        if (!cheekKiss && working.characters.some(ch => /\bincoming kiss\b/i.test(ch.prompt))) {
          // 親吻要看得出來：臉部特寫、閉眼、嘟唇；拿掉會搶戲的「微笑」
          working.characters = working.characters.map(ch => /\bincoming kiss\b/i.test(ch.prompt)
            ? Object.assign({}, ch, { prompt: ch.prompt.replace(/,\s*(soft |gentle |light |slight )?smile\b/gi, '').replace(/,\s*(eyes half-closed|half-closed eyes|looking at viewer)\b/gi, '') + ', closed eyes, puckered lips' })
            : ch);
          if (!/\bincoming kiss\b/i.test(working.prompt)) working.prompt = `${working.prompt}, incoming kiss`;
          if (!/\bface focus\b/i.test(working.prompt)) working.prompt = `${working.prompt}, face focus`;
        }
      }
      working.prompt = refineFramingTags_(working.prompt, Array.isArray(working.characters) ? working.characters.length : 0);
      // 玩家自己找死：從者的錯愕臉是主角（導演常把御主放大在前景、從者小小站後面）→ 程式鎖定構圖
      if (working._directorContext && working._directorContext.isSelfDeath && Array.isArray(working.characters)) {
        working.characters = working.characters.map(ch => {
          if (ch.id === 'player_master') {
            return Object.assign({}, ch, { prompt: removeTagsKeepWeights_(ch.prompt, t => /\b(foreground|close-up|holding|reaching|hand|eyes|face|looking|smile|smiling|grin)\b/i.test(t)) + ', lying face down on the floor behind her, face not visible, partially visible' });
          }
          const pov = working.cameraMode === 'pov';
          const jump = Boolean(working._directorContext.isJumpDeath);
          const place = pov ? (jump ? 'leaning over the railing above, looking down at viewer' : 'looking at viewer') : (jump ? 'foreground, standing alone at the railing edge' : 'foreground');
          return Object.assign({}, ch, {
            prompt: removeTagsKeepWeights_(ch.prompt, t => /\b(background|anguish|tears|crying|reaching out|outstretched|sad|dumbfounded|jaw|open mouth|mouth agape|sweatdrop|blank stare|screaming|shouting|smile|smiling|grin|looking (down|away))\b/i.test(t)) + `, ${place}, ${SELF_DEATH_SERVANT_FACE_}`,
            uc: [ch.uc, 'open mouth, jaw drop, sweatdrop, chibi, comedic, smile, tears, blush'].filter(Boolean).join(', ')
          });
        });
        // 第一人稱：上半身看清楚她的臉；第三人稱：牛仔鏡頭才拍得到倒在她身後地上的御主
        const jumpCg = Boolean(working._directorContext.isJumpDeath);
        const frame = working.cameraMode === 'pov' ? (jumpCg ? 'upper body, from below, dutch angle' : 'upper body') : (jumpCg ? 'cowboy shot' : 'cowboy shot, from side');
        working.prompt = working.prompt.replace(/\b(wide shot|full body|medium shot|cowboy shot|upper body|from behind|face focus|close-up)\b,?\s*/gi, '').replace(/^((?:\d+(?:girls?|boys?)|multiple characters|solo)(?:,\s*)?)+/i, m => `${m.replace(/,?\s*$/, '')}, ${frame}, `);
      }
      // 兩人對打或面對面：導演常把一人放前景背對鏡頭 → 加 from side，並刪掉「前景」字眼，讓兩人的臉都看得到
      const pairFacing = Array.isArray(working.characters) && working.characters.length === 2 && Array.isArray(directed.char_directions)
        && directed.char_directions.some(d => d && /\b(clash|clashing|facing (each other|another character|the other)|confront|duel|sword fight|parry|parrying|crossed blades)/i.test(`${d.interaction || ''} ${d.action || ''}`));
      if (pairFacing && !/\b(from side|profile)\b/i.test(working.prompt) && working.cameraMode !== 'pov') {
        working.prompt = `${working.prompt}, from side`;
        working.characters = working.characters.map(ch => Object.assign({}, ch, { prompt: String(ch.prompt || '').replace(/,\s*(in the )?foreground\b/gi, '').replace(/,\s*back to (the )?(viewer|camera)\b/gi, '') }));
      }
      // 單人解放寶具：導演常為了拍進整個特效選遠景，或寫「雙腳分開、站在正中央、高舉大旗」讓人被畫成遠處小人（實測貞德、黑貞德）
      // → cowboy shot＋仰角放在人數標籤後面，拿掉全身字眼，特效留在背後
      if (Array.isArray(working.characters) && working.characters.length === 1 && working.characters[0].npBoost && working.cameraMode !== 'pov') {
        const restNp = stripCountTags_(String(working.prompt).replace(/,?\s*\b(wide shot|full body|long shot|medium shot|cowboy shot|from below)\b/gi, '')).replace(/^,\s*/, '');
        working.prompt = [working.countPrefix, 'cowboy shot, from below, dynamic pose', restNp].filter(Boolean).join(', ');
        const FULL_RE = /\b(feet|legs apart|full body|standing (firmly )?(in the )?center|center|wide stance)\b/i;
        working.characters = working.characters.map(ch => Object.assign({}, ch, { prompt: String(ch.prompt || '').split(',').map(t => t.trim()).filter(t => t && (/::/.test(t) || !FULL_RE.test(t))).join(', ') }));
      }
      // 情緒高點（哭泣、流淚）：1～2 人時拉成上半身＋臉部特寫，不然全身鏡頭看不到眼淚（實測櫻哭著告白卻畫成站在客廳中間）
      const nNow = Array.isArray(working.characters) ? working.characters.length : 0;
      const selfDeathCg = Boolean(working._directorContext && working._directorContext.isSelfDeath);
      if (!selfDeathCg && nNow >= 1 && nNow <= 2 && Array.isArray(directed.char_directions) && directed.char_directions.some(d => d && /\b(crying|tears|tearing up|sobbing|tearful|weeping)\b/i.test(String(d.action || '')))) {
        // 鏡頭標籤放在人數標籤後面（越前面權重越高；放最後會被一大段場景描述蓋過）
        const rest = stripCountTags_(String(working.prompt).replace(/,?\s*\b(cowboy shot|medium shot|wide shot|full body|upper body|close-up)\b/gi, '')).replace(/^,\s*/, '');
        working.prompt = [working.countPrefix, 'upper body, face focus, streaming tears', rest].filter(Boolean).join(', ');
      }
      // 擁抱、親吻：鏡頭拉近到上半身，避免 upper body 和 medium shot 同時出現互相抵銷
      if (Array.isArray(directed.char_directions) && directed.char_directions.some(d => d && isRomanticInteraction_(`${d.interaction || ''} ${d.action || ''}`))) {
        working.prompt = refineRomanceFraming_(working.prompt).replace(/,?\s*[^,]*\bsilhouettes?\b[^,]*/gi, '');
        // 第三人稱接吻：臉部特寫＋Danbooru 的 kiss 標籤放前面（實測只寫 upper body 時偶爾會畫成遠處剪影）
        const lipKiss = !cheekKiss && working.cameraMode !== 'pov' && directed.char_directions.some(d => d && /\bkiss(es|ing)?\b/i.test(`${d.interaction || ''} ${d.action || ''}`));
        if (lipKiss) {
          const rest = stripCountTags_(String(working.prompt).replace(/,?\s*\b(upper body|close-up|kiss)\b/gi, '')).replace(/^,\s*/, '');
          working.prompt = [working.countPrefix, 'upper body, kiss, faces close together', rest].filter(Boolean).join(', ');
          // 角色欄位的站位／腳部字眼會讓其中一人被畫成全身、站到背景（實測一大一小、遠近對不上）→ 接吻時拿掉
          const STANCE_RE = /\b(standing|tiptoe(s|ing)?|on tiptoes?|in front of|behind|foreground|background|center|walking|full body|legs?|feet|barefoot)\b/i;
          working.characters = working.characters.map(ch => {
            const toks = String(ch.prompt || '').split(',').map(t => t.trim()).filter(Boolean);
            return Object.assign({}, ch, { prompt: toks.filter(t => /::/.test(t) || !STANCE_RE.test(t)).join(', ') });
          });
        }
      }
      // 只有膝枕、沒有掏耳朵：NovelAI 看到膝枕常自己補上耳挖（實測美狄亞、玉藻前、沖田）→ 負面排除
      if (/\blap pillow\b/i.test(String(working.prompt || '')) && !/\bmimikaki\b/i.test(String(working.prompt || '')) && Array.isArray(working.characters)) {
        working.characters = working.characters.map(ch => Object.assign({}, ch, { uc: [ch.uc, 'mimikaki, ear pick, holding ear pick, cotton swab'].filter(Boolean).join(', ') }));
      }
      if (/\b(upper body|close-up|portrait|face focus)\b/i.test(String(working.prompt || '')) && Array.isArray(working.characters)) {
        working.characters = working.characters.map(ch => Object.assign({}, ch, { prompt: stripLowerBodyForCloseUp_(ch.prompt) }));
      } else if (/\bcowboy shot\b/i.test(String(working.prompt || '')) && Array.isArray(working.characters)) {
        // cowboy shot（大腿以上）鞋子本來就不入鏡；服裝寫了高跟鞋、靴子會被拉成全身（Rider 幾乎每張都全身就是這個原因）
        working.characters = working.characters.map(ch => Object.assign({}, ch, { prompt: stripLowerBodyForCloseUp_(ch.prompt, true) }));
      }
    }
    delete working._directorContext;
  }

  const result = generateNovelAIImageSafe_(working);
  result.resolvedPayload = working;

  // 生圖成功後，把翻譯後的 payload 回寫 ChatLog（僅限本次有執行導演翻譯者）
  if (directedApplied && working._player && working._turn !== null && working._turn !== undefined) {
    updateChatLogImagePayload_(SpreadsheetApp.getActiveSpreadsheet(), working._player, working._turn, working);
  }

  return result;
}

function generateNovelAIImageSafe_(params) {
  const naiKey = getNovelAIKey_();

  // 生圖使用獨立的 UserLock，不與回合推演的 ScriptLock 互相卡住
  const naiLock = LockService.getUserLock();
  naiLock.waitLock(25000);

  try {
    // V5 品質已經很穩，負面提示詞保持精簡：舊時代那一長串（bad, error, extra, bad hands...）會讓畫面變灰、變保守
    // 只排除品質底線、文字浮水印、馬賽克；角色專屬的負面（GameData.js 的 uc）另外照常套用
    const defaultUc = (typeof params.baseUc === 'string' && params.baseUc) ? params.baseUc : 'worst quality, bad quality, lowres, jpeg artifacts, watermark, signature, text, speech bubble, censored, mosaic censoring, bar censor, smartphone';
    const cleanedChars = (Array.isArray(params.characters) ? params.characters : []).filter(c => String(c.prompt || '').trim().length > 0)
      .map(c => Object.assign({}, c, { prompt: closeUmbrellaIndoors_(c.prompt, params.prompt) }));

    const styleKey = params.artStyle || 'official';
    const styleTags = params.noStyle ? '' : (ART_STYLE_PRESETS_[styleKey] || ART_STYLE_PRESETS_['official']);

    let finalPrompt = params.noStyle ? String(params.prompt || '').trim() : addNightFillLight_(indoorWeatherFix_(applyWeatherTags_(String(params.prompt || '').trim(), params.weather)));
    if (styleTags) {
      finalPrompt = finalPrompt ? `${finalPrompt}, ${styleTags}` : styleTags;
    }
    if (params.autoQuality !== false) {
      const qualityTags = (typeof params.qualityTags === 'string') ? params.qualityTags : 'very aesthetic, masterpiece, high complexity, no text';
      if (qualityTags) finalPrompt = finalPrompt ? `${finalPrompt}, ${qualityTags}` : qualityTags;
    }
    // 3 人以上的畫面偶爾會把同一個角色畫兩次（實測：Archer 被畫成兩個），加 clone 降低機率
    const cloneUc = cleanedChars.length >= 3 ? 'clone' : '';
    // 成人模式關閉：主負面直接排除裸露（只改服裝成浴巾時，浴室場景 NovelAI 仍可能自己畫出裸露）
    const sfwUc = params.adultMode === false ? 'nsfw, nude, nipples, completely nude, topless' : '';
    const finalUc = [defaultUc, cloneUc, sfwUc, params.uc].filter(Boolean).join(', ');

    const seed = params.seed && Number(params.seed) > 0 ? Number(params.seed) : Math.floor(Math.random() * 4294967295);
    const useCoords = false;

    const charCaptions = cleanedChars.map(c => ({
      char_caption: c.prompt,
      centers: [{ x: 0.5, y: 0.5 }]
    }));

    const ucCharCaptions = cleanedChars.map(c => ({
      char_caption: c.uc || '',
      centers: [{ x: 0.5, y: 0.5 }]
    }));

    const payload = {
      input: finalPrompt,
      model: params.model || 'nai-diffusion-5-full',
      action: 'generate',
      parameters: {
        params_version: 4,
        width: Number(params.width) || 1216,
        height: Number(params.height) || 832,
        scale: Number(params.scale) || 5.0,
        sampler: params.sampler || 'k_euler_ancestral',
        steps: Math.min(Number(params.steps) || 28, 28),
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: false,
        autoSmea: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: true,
        cfg_rescale: typeof params.cfgRescale === 'number' ? params.cfgRescale : 0.25,
        noise_schedule: params.noiseSchedule || 'karras',
        legacy_v3_extend: false,
        skip_cfg_above_sigma: null,
        use_coords: useCoords,
        seed: seed,
        characterPrompts: cleanedChars.map(c => ({
          prompt: c.prompt,
          uc: c.uc || '',
          center: { x: 0.5, y: 0.5 },
          enabled: true
        })),
        v4_prompt: {
          caption: { base_caption: finalPrompt, char_captions: charCaptions },
          use_coords: useCoords,
          use_order: true
        },
        v4_negative_prompt: {
          caption: { base_caption: finalUc, char_captions: ucCharCaptions },
          legacy_uc: false
        },
        negative_prompt: finalUc
      }
    };

    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = UrlFetchApp.fetch('https://image.novelai.net/ai/generate-image', {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + naiKey, Accept: '*/*' },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const code = response.getResponseCode();
        if (code === 200) {
          const zipBlob = response.getBlob().setContentType('application/zip');
          const unzipped = Utilities.unzip(zipBlob);
          if (!unzipped || unzipped.length === 0) {
            lastError = '(200): 回傳壓縮檔為空';
            continue;
          }
          const imgBase64 = Utilities.base64Encode(unzipped[0].getBytes());
          return {
            base64: 'data:image/png;base64,' + imgBase64,
            seed: seed,
            promptDebug: finalPrompt
          };
        } else if ((code === 429 || code >= 500) && attempt < 3) {
          lastError = `(${code}): ${response.getContentText()}`;
          Utilities.sleep(2500 * attempt);
        } else {
          lastError = `(${code}): ${response.getContentText()}`;
          break;
        }
      } catch (reqErr) {
        lastError = `(例外): ${reqErr && reqErr.message ? reqErr.message : String(reqErr)}`;
        if (attempt < 3) {
          Utilities.sleep(2500 * attempt);
        }
      }
    }
    throw new Error(`NovelAI 生圖失敗 ${lastError}`);
  } finally {
    naiLock.releaseLock();
  }
}

