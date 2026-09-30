// Subjects for the Codex prompt pack (docs/design/60-codex-pipeline.md §3.3). English + Korean scene text per slot subject.
import type { CharacterId, KartBodyId, TrackId, ThemeId, ItemId } from '@cr/content';

export interface CharSubject { id: CharacterId; en: string; ko: string; lookEn: string; lookKo: string; palette: string[]; kart: KartBodyId }
export const CHARACTERS: CharSubject[] = [
  { id: 'clay', en: 'Clay', ko: '클레이', lookEn: 'the classic terracotta Clawd wearing a long ivory #FAF9F5 racing scarf trailing in the wind', lookKo: '바람에 휘날리는 긴 아이보리색 #FAF9F5 레이싱 스카프를 두른 클래식 테라코타 클로드', palette: ['#D87656', '#BE684D', '#FAF9F5', '#D97757', '#141413'], kart: 'pebble' },
  { id: 'pixel', en: 'Pixel', ko: '픽셀', lookEn: 'a true-voxel Clawd built from real visible cubes with flat 8-bit shading steps and grey #8B8B8B pixel trim', lookKo: '눈에 보이는 진짜 큐브로 쌓아 만든 복셀 클로드, 8비트 단계의 평면 음영과 회색 #8B8B8B 픽셀 장식', palette: ['#D87656', '#BE684D', '#8B8B8B', '#F9F8F4', '#141413'], kart: 'arrowhead' },
  { id: 'turbo', en: 'Turbo', ko: '터보', lookEn: 'a racer Clawd in an ivory full-face helmet dome with sky-blue #6A9BCC stripes, a dark visor and a small fin spoiler', lookKo: '하늘색 #6A9BCC 줄무늬가 들어간 아이보리색 풀페이스 헬멧 돔과 어두운 바이저, 작은 핀 스포일러를 단 레이서 클로드', palette: ['#D97757', '#BE684D', '#6A9BCC', '#FAF9F5', '#2A2A28'], kart: 'arrowhead' },
  { id: 'anchor', en: 'Captain Anchor', ko: '앵커 선장', lookEn: 'a pirate Clawd with a black tricorn hat with gold #E0B04B trim, a red #B53333 coat, an eyepatch over one eye slot and a tiny sparkle-parrot on its arm', lookKo: '금색 #E0B04B 테두리의 검은 삼각모, 빨간 #B53333 코트, 한쪽 눈 슬롯을 가린 안대, 팔 위의 작은 반짝이 앵무새를 가진 해적 클로드', palette: ['#C96442', '#A8533A', '#B53333', '#30302E', '#E0B04B'], kart: 'tugboat' },
  { id: 'rune', en: 'Rune', ko: '룬', lookEn: 'a wizard Clawd with a tall floppy navy #3B3F8F cone hat with a bent tip and cream star prints, holding a sparkle-topped staff', lookKo: '끝이 꺾인 늘어진 남색 #3B3F8F 고깔모자에 크림색 별무늬, 끝에 반짝이가 달린 지팡이를 든 마법사 클로드', palette: ['#E08A6D', '#C4745A', '#3B3F8F', '#F0EEE6', '#141413'], kart: 'clay_comet' },
  { id: 'nova', en: 'Nova', ko: '노바', lookEn: 'an astronaut Clawd inside a clear glass bubble helmet, wearing a parchment-white suit collar with sky-blue trim, a small backpack and an antenna', lookKo: '투명한 유리 버블 헬멧을 쓰고 하늘색 테두리의 흰 우주복 깃, 작은 배낭과 안테나를 단 우주비행사 클로드', palette: ['#D97757', '#BE684D', '#F5F4ED', '#6A9BCC', '#141413'], kart: 'glacier_sled' },
  { id: 'kage', en: 'Kage', ko: '카게', lookEn: 'a ninja Clawd in a charcoal #1F1E1D hood and mask showing only a single eye slit, with long scarf tails and a steel forehead plate', lookKo: '눈 부분만 가늘게 뚫린 숯색 #1F1E1D 두건과 마스크, 긴 스카프 꼬리, 강철 이마 보호대를 한 닌자 클로드', palette: ['#D97757', '#BE684D', '#1F1E1D', '#B0AEA5', '#141413'], kart: 'neon_blade' },
  { id: 'bisque', en: 'Chef Bisque', ko: '비스크 셰프', lookEn: 'a chef Clawd with a tall white toque, a sage-green #788C5D neckerchief and a wooden ladle', lookKo: '높은 흰색 셰프 모자와 세이지그린 #788C5D 스카프, 나무 국자를 든 요리사 클로드', palette: ['#D97757', '#BE684D', '#FFFFFF', '#788C5D', '#141413'], kart: 'jet_kettle' },
  { id: 'frost', en: 'Frost', ko: '프로스트', lookEn: 'an ice Clawd with a translucent pale-blue #9FD3F2 crystal shell, a white icicle crown and fluffy earmuffs, deep navy eye slots', lookKo: '반투명한 연하늘색 #9FD3F2 얼음 결정 몸체, 흰 고드름 왕관과 폭신한 귀마개, 짙은 남색 눈 슬롯의 얼음 클로드', palette: ['#9FD3F2', '#7BB8DE', '#FFFFFF', '#E8F6FF', '#0E2A47'], kart: 'glacier_sled' },
  { id: 'glitch', en: 'Glitch', ko: '글리치', lookEn: 'a neon cyber Clawd with a dark #1C1B22 body, glowing orange #FF7A50 and cyan #2EF2FF edge lines, a cyan holographic visor band instead of eye slots and chunky headphones', lookKo: '어두운 #1C1B22 몸에 주황 #FF7A50과 청록 #2EF2FF 발광 테두리 라인, 눈 슬롯 대신 청록색 홀로그램 바이저 띠, 두툼한 헤드폰을 쓴 네온 사이버 클로드', palette: ['#1C1B22', '#121117', '#FF7A50', '#2EF2FF'], kart: 'neon_blade' },
  { id: 'bolt', en: 'Bolt', ko: '볼트', lookEn: 'a polished copper #B87333 robot Clawd with rivets, a bulb antenna, amber #FFB347 LED screen eyes and a wind-up key on its back', lookKo: '리벳과 전구 안테나, 호박색 #FFB347 LED 화면 눈, 등에 태엽 열쇠가 달린 광택 구리 #B87333 로봇 클로드', palette: ['#B87333', '#8C5626', '#FFB347', '#5A5A5A'], kart: 'jet_kettle' },
  { id: 'duke', en: 'Duke', ko: '듀크', lookEn: 'a royal Clawd wearing a golden #F2C14E crown with a ruby, a white ermine cape and holding a small scepter', lookKo: '루비가 박힌 황금 #F2C14E 왕관과 흰 담비털 망토를 두르고 작은 홀을 든 왕족 클로드', palette: ['#C96442', '#A8533A', '#F2C14E', '#B53333', '#FAF9F5'], kart: 'crown_cruiser' },
];

export interface KartSubject { id: KartBodyId; en: string; ko: string; lookEn: string; lookKo: string }
export const KARTS: KartSubject[] = [
  { id: 'pebble', en: 'Pebble', ko: '페블', lookEn: 'an open tube-frame go-kart with a rounded pebble-shaped nose, chunky tyres and a single exhaust', lookKo: '둥근 조약돌 모양 노즈와 두툼한 타이어, 배기구 하나를 단 오픈 튜브 프레임 고카트' },
  { id: 'clay_comet', en: 'Clay Comet', ko: '클레이 코멧', lookEn: 'a bubble-capsule car with a glossy canopy and a sparkle-shaped tail fin', lookKo: '광택 캐노피와 반짝이 모양 꼬리 날개를 단 버블 캡슐 자동차' },
  { id: 'arrowhead', en: 'Arrowhead', ko: '애로헤드', lookEn: 'a low open-wheel wedge racer with front and rear wings', lookKo: '앞뒤 날개가 달린 낮은 오픈휠 쐐기형 레이서' },
  { id: 'tugboat', en: 'Tugboat', ko: '터그보트', lookEn: 'a chunky retro buggy with balloon tyres, a rope bumper and a little smokestack', lookKo: '풍선 타이어와 밧줄 범퍼, 작은 굴뚝이 달린 두툼한 레트로 버기' },
  { id: 'glacier_sled', en: 'Glacier Sled', ko: '글레이셔 슬레드', lookEn: 'a ski-front hover kart with frosted panels and glowing cyan thrusters', lookKo: '서리 낀 패널과 빛나는 청록색 추진기를 단 스키 앞코의 호버 카트' },
  { id: 'neon_blade', en: 'Neon Blade', ko: '네온 블레이드', lookEn: 'a low cyber hypercar with cyan underglow and emissive rim wheels', lookKo: '청록색 언더글로와 발광 림 휠을 가진 낮은 사이버 하이퍼카' },
  { id: 'jet_kettle', en: 'Jet Kettle', ko: '제트 케틀', lookEn: 'a steampunk brass boiler kart with twin smokestacks, rivets and pressure gauges', lookKo: '쌍둥이 굴뚝과 리벳, 압력계가 달린 스팀펑크 황동 보일러 카트' },
  { id: 'crown_cruiser', en: 'Crown Cruiser', ko: '크라운 크루저', lookEn: 'a royal chariot-car with gold filigree, velvet seat and crown ornaments', lookKo: '금세공 장식과 벨벳 좌석, 왕관 장식이 달린 왕실 전차형 자동차' },
];

export interface TrackSubject { id: TrackId; en: string; ko: string; sceneEn: string; sceneKo: string }
export const TRACKS: TrackSubject[] = [
  { id: 'meadow_loop', en: 'Meadow Loop', ko: '초원 순환로', sceneEn: 'a windmill on a green meadow, a humped stone bridge over a creek, a cozy village green with terracotta roofs', sceneKo: '초록 초원 위의 풍차, 개울 위 아치형 돌다리, 테라코타 지붕의 아늑한 마을 광장' },
  { id: 'belltower_piazza', en: 'Belltower Piazza', ko: '종탑 광장', sceneEn: 'a 270° cobblestone piazza circling a tall bell tower, stone arches, pennant flags and a fountain', sceneKo: '높은 종탑을 270° 도는 자갈 광장, 돌 아치, 삼각 깃발과 분수' },
  { id: 'sunstone_bazaar', en: 'Sunstone Bazaar', ko: '선스톤 바자르', sceneEn: 'a desert market street under striped awnings, a palm oasis and a dune jump', sceneKo: '줄무늬 차양 아래 사막 시장 골목, 야자수 오아시스와 모래 언덕 점프대' },
  { id: 'sandglass_canyon', en: 'Sandglass Canyon', ko: '모래시계 협곡', sceneEn: 'a narrow slot canyon of layered sandstone, falling sand cascades and a giant hourglass portal', sceneKo: '층층이 쌓인 사암의 좁은 협곡, 쏟아지는 모래 폭포와 거대한 모래시계 포털' },
  { id: 'snowglobe_halfpipe', en: 'Snowglobe Halfpipe', ko: '스노글로브 하프파이프', sceneEn: 'a glittering ice halfpipe, a penguin village of snow cabins and a crystal cave', sceneKo: '반짝이는 얼음 하프파이프, 눈 오두막이 모인 펭귄 마을과 수정 동굴' },
  { id: 'aurora_summit', en: 'Aurora Summit', ko: '오로라 정상 활강', sceneEn: 'a night downhill run under a green-violet aurora, pine forests and a ski jump', sceneKo: '초록·보랏빛 오로라 아래 밤의 다운힐, 소나무 숲과 스키 점프대' },
  { id: 'fernwood_hollow', en: 'Fernwood Hollow', ko: '고사리숲 골짜기', sceneEn: 'giant tree trunks and ferns, a mossy log bridge, bouncy glowing mushrooms and fireflies', sceneKo: '거대한 나무 줄기와 고사리, 이끼 낀 통나무 다리, 통통 튀는 빛나는 버섯과 반딧불이' },
  { id: 'cascade_slalom', en: 'Cascade Slalom', ko: '폭포 슬라럼', sceneEn: 'a slalom between rock pillars, a roaring waterfall and a canopy boardwalk', sceneKo: '바위 기둥 사이 슬라럼, 쏟아지는 폭포와 나무 위 산책로' },
  { id: 'geode_rail_quarry', en: 'Geode Rail Quarry', ko: '정동석 레일 채석장', sceneEn: 'a crystal cavern with glowing geodes, ore-cart rails and a wooden trestle', sceneKo: '빛나는 정동석이 박힌 수정 동굴, 광차 레일과 나무 트레슬 다리' },
  { id: 'magma_switchback', en: 'Magma Switchback', ko: '마그마 굽잇길', sceneEn: 'a 540° helix road spiralling over a glowing lava lake with erupting geysers', sceneKo: '끓어오르는 간헐천과 빛나는 용암 호수 위를 540° 휘감아 도는 나선 도로' },
  { id: 'pumpkin_lane', en: 'Pumpkin Lane', ko: '호박 퍼레이드 길', sceneEn: 'a cozy autumn night lantern parade, a pumpkin patch and a cute graveyard with smiling tombstones', sceneKo: '아늑한 가을밤 등불 퍼레이드, 호박밭과 웃는 묘비가 있는 귀여운 묘지' },
  { id: 'manor_catacombs', en: 'Manor Catacombs', ko: '저택 지하묘지', sceneEn: 'a giant candlelit ballroom, winding catacombs and a swirling portal warp', sceneKo: '촛불이 밝힌 거대한 무도회장, 구불구불한 지하묘지와 소용돌이 포털' },
  { id: 'coral_cove_docks', en: 'Coral Cove Docks', ko: '산호만 부두', sceneEn: 'a wooden pier boardwalk, a moored toy galleon, turquoise water, coral and a sunny beach', sceneKo: '나무 부두 산책로, 정박한 장난감 갈레온선, 청록빛 바다와 산호, 햇살 가득한 해변' },
  { id: 'kraken_lighthouse', en: 'Kraken Lighthouse', ko: '크라켄 등대', sceneEn: 'a road spiralling up a striped lighthouse, a cannon fort and a friendly giant tentacle at sunset', sceneKo: '노을 속 줄무늬 등대를 감아 오르는 도로, 대포 요새와 친근한 거대 촉수' },
  { id: 'rainline_blvd', en: 'Rainline Boulevard', ko: '레인라인 대로', sceneEn: 'a rainy neon city boulevard with glowing signs, reflective wet asphalt, traffic and an overpass', sceneKo: '빛나는 간판과 젖어 반사되는 아스팔트, 차량 행렬과 고가도로가 있는 비 오는 네온 대로' },
  { id: 'skyway_interchange', en: 'Skyway Interchange', ko: '스카이웨이 나들목', sceneEn: 'a three-level cloverleaf interchange at dusk above a city, with a subway train below', sceneKo: '해 질 녘 도시 위 3층 클로버형 나들목과 그 아래를 달리는 지하철' },
  { id: 'spark_grand_circuit', en: 'Spark Grand Circuit', ko: '스파크 그랜드 서킷', sceneEn: 'a professional race circuit with grandstands, pit lane garages, gantries and tyre walls (no sponsor logos)', sceneKo: '관중석, 피트 레인 차고, 갠트리와 타이어 벽이 있는 프로 레이싱 서킷(스폰서 로고 없음)' },
  { id: 'sunset_arena_rally', en: 'Sunset Arena Rally', ko: '선셋 아레나 랠리', sceneEn: 'a stadium bowl at sunset with gravel jumps, floodlights and cheering crowds of tiny blocks', sceneKo: '노을 진 경기장 볼, 자갈 점프대와 조명탑, 작은 블록 관중의 환호' },
  { id: 'token_foundry', en: 'Token Foundry', ko: '토큰 주조소', sceneEn: 'a bright assembly hall with conveyor belts carrying glowing tokens and rhythmic hydraulic presses', sceneKo: '빛나는 토큰을 실어 나르는 컨베이어 벨트와 규칙적으로 움직이는 유압 프레스가 있는 밝은 조립 공장' },
  { id: 'orbital_express', en: 'Orbital Express', ko: '궤도 급행선', sceneEn: 'sky rails around a space station, a vertical loop and a deep starfield with a ringed planet', sceneKo: '우주 정거장을 휘감는 하늘 레일, 수직 루프와 고리 행성이 떠 있는 깊은 별밭' },
];

export interface ThemeSubject { id: ThemeId; en: string; ko: string; moodEn: string; moodKo: string }
export const THEMES: ThemeSubject[] = [
  { id: 'clayhill_village', en: 'Clayhill Village', ko: '클레이힐 마을', moodEn: 'a sunny terracotta hill town at golden hour', moodKo: '황금빛 오후의 햇살 가득한 테라코타 언덕 마을' },
  { id: 'sunstone_desert', en: 'Sunstone Desert', ko: '선스톤 사막', moodEn: 'warm sandstone dunes, awnings and an oasis under a hot sun', moodKo: '뜨거운 태양 아래 따뜻한 사암 모래 언덕과 차양, 오아시스' },
  { id: 'frostbyte_glacier', en: 'Frostbyte Glacier', ko: '프로스트바이트 빙하', moodEn: 'sparkling blue ice, snow cabins and aurora skies', moodKo: '반짝이는 푸른 얼음과 눈 오두막, 오로라 하늘' },
  { id: 'canopy_forest', en: 'Canopy Forest', ko: '캐노피 숲', moodEn: 'a lush giant forest with dappled light, ferns and glowing mushrooms', moodKo: '햇살이 얼룩지는 울창한 거대 숲, 고사리와 빛나는 버섯' },
  { id: 'ember_mine', en: 'Ember Mine', ko: '엠버 광산', moodEn: 'a warm glowing mine with geodes, rails and lava light', moodKo: '정동석과 레일, 용암 빛이 감도는 따뜻한 광산' },
  { id: 'lantern_hollow', en: 'Lantern Hollow', ko: '랜턴 할로우', moodEn: 'a cozy autumn night festival of pumpkins and warm lanterns', moodKo: '호박과 따뜻한 등불이 가득한 아늑한 가을밤 축제' },
  { id: 'coral_cove', en: 'Coral Cove', ko: '코랄 코브', moodEn: 'tropical turquoise water, coral, docks and a lighthouse', moodKo: '열대의 청록빛 바다와 산호, 부두와 등대' },
  { id: 'neon_harbor', en: 'Neon Harbor', ko: '네온 하버', moodEn: 'a rainy neon harbour city at night with reflections', moodKo: '반사광이 번지는 비 오는 밤의 네온 항구 도시' },
  { id: 'spark_circuit', en: 'Spark Circuit', ko: '스파크 서킷', moodEn: 'a bright professional race circuit and a sunset arena', moodKo: '밝은 프로 레이싱 서킷과 노을 진 아레나' },
  { id: 'orbital_nexus', en: 'Orbital Nexus', ko: '오비탈 넥서스', moodEn: 'a clean space station with starfields and sky rails', moodKo: '별밭과 하늘 레일이 펼쳐진 깔끔한 우주 정거장' },
];

export interface ItemSubject { id: ItemId; en: string; ko: string; iconEn: string; iconKo: string }
export const ITEMS: ItemSubject[] = [
  { id: 'turbo_token', en: 'Turbo Token', ko: '터보 토큰', iconEn: 'a glossy coral coin-token with a forward chevron and a small flame trail', iconKo: '앞쪽을 향한 갈매기 무늬와 작은 불꽃 꼬리가 있는 광택 코랄 토큰 코인' },
  { id: 'attention_tether', en: 'Attention Tether', ko: '어텐션 테더', iconEn: 'a glowing grappling hook with a springy cyan light tether', iconKo: '탄력 있는 청록색 빛 줄이 달린 빛나는 갈고리' },
  { id: 'overclock_aura', en: 'Overclock Aura', ko: '오버클럭 오라', iconEn: 'a chip-shaped core radiating an orange heat-shimmer aura ring', iconKo: '주황빛 열기 오라 고리를 뿜는 칩 모양 코어' },
  { id: 'prompt_missile', en: 'Prompt Missile', ko: '프롬프트 미사일', iconEn: 'a chunky toy missile shaped like a rounded speech bubble with a coral nose and cream fins', iconKo: '코랄색 앞코와 크림색 날개를 단, 둥근 말풍선 모양의 두툼한 장난감 미사일' },
  { id: 'top1_missile', en: 'Top-1 Missile', ko: '톱-1 미사일', iconEn: 'a golden toy missile with a small crown on its nose and a star trail', iconKo: '앞코에 작은 왕관이 달리고 별 꼬리를 남기는 황금 장난감 미사일' },
  { id: 'token_bomb', en: 'Token Bomb', ko: '토큰 폭탄', iconEn: 'a translucent bubble sphere with glowing token glyphs inside and a short cream fuse with a coral spark', iconKo: '안에 빛나는 토큰 문양이 떠 있는 반투명 버블 구체와 코랄색 불꽃이 튀는 짧은 크림색 심지' },
  { id: 'bug_report', en: 'Bug Report', ko: '버그 리포트', iconEn: 'a cute round beetle-bot with tiny legs holding a folded report card', iconKo: '작은 다리로 접힌 보고서 카드를 든 귀여운 둥근 딱정벌레 로봇' },
  { id: 'broadcast_bolt', en: 'Broadcast Bolt', ko: '브로드캐스트 볼트', iconEn: 'a lightning bolt bursting from a small antenna dish with radio rings', iconKo: '전파 고리를 내뿜는 작은 안테나 접시에서 터져 나오는 번개' },
  { id: 'throttle_drone', en: 'Throttle Drone', ko: '스로틀 드론', iconEn: 'a round quad-rotor drone with a stop-hand light panel and a soft red glow', iconKo: '손바닥 정지 표시등 패널과 은은한 빨간 빛을 내는 둥근 쿼드콥터 드론' },
  { id: 'firewall', en: 'Firewall', ko: '파이어월', iconEn: 'a row of three glowing brick blocks with friendly flames on top', iconKo: '위에 귀여운 불꽃이 타오르는 빛나는 벽돌 블록 세 개' },
  { id: 'glitch_puddle', en: 'Glitch Puddle', ko: '글리치 웅덩이', iconEn: 'a splash puddle of RGB-split pixel goo with scattered squares', iconKo: '흩어진 사각 픽셀이 튀는 RGB 분리 효과의 끈적한 웅덩이' },
  { id: 'redaction_cloud', en: 'Redaction Cloud', ko: '검열 구름', iconEn: 'a puffy dark cloud with black redaction bars across it', iconKo: '검은 검열 막대가 가로지르는 뭉게뭉게한 어두운 구름' },
  { id: 'mirror_mode', en: 'Mirror Mode', ko: '미러 모드', iconEn: 'a round hand mirror reflecting a reversed curved arrow', iconKo: '뒤집힌 곡선 화살표가 비치는 둥근 손거울' },
  { id: 'context_shield', en: 'Context Shield', ko: '컨텍스트 실드', iconEn: 'a hexagon-patterned bubble shield in cream and sky blue', iconKo: '크림색과 하늘색의 육각 무늬 버블 방패' },
  { id: 'interrupt_pulse', en: 'Interrupt Pulse', ko: '인터럽트 펄스', iconEn: 'a pause-symbol core emitting a crisp white shockwave ring', iconKo: '선명한 흰 충격파 고리를 내뿜는 일시정지 기호 코어' },
  { id: 'alignment_halo', en: 'Alignment Halo', ko: '얼라인먼트 헤일로', iconEn: 'a glowing golden halo ring with small aligned arrows around it', iconKo: '주위에 작은 화살표들이 정렬된 빛나는 황금 헤일로 고리' },
  { id: 'interpretability_lens', en: 'Interpretability Lens', ko: '해석 렌즈', iconEn: 'a magnifying glass revealing a tiny glowing circuit pattern', iconKo: '작게 빛나는 회로 무늬를 드러내는 돋보기' },
  { id: 'mutex_lock', en: 'Mutex Lock', ko: '뮤텍스 락', iconEn: 'a chunky padlock with two interlocking rings', iconKo: '두 개의 고리가 맞물린 두툼한 자물쇠' },
];

export const MODES = [
  { id: 'speed', en: 'Speed Race', ko: '스피드전', sceneEn: 'a racer and kart with heavy horizontal motion blur and a big boost flame', sceneKo: '강한 가로 모션 블러와 커다란 부스터 불꽃을 뿜는 레이서와 카트' },
  { id: 'item', en: 'Item Race', ko: '아이템전', sceneEn: 'a racer dodging a flying Prompt Missile with floating item cubes around', sceneKo: '날아오는 프롬프트 미사일을 피하는 레이서와 주위에 떠 있는 아이템 큐브' },
  { id: 'timeAttack', en: 'Time Attack', ko: '타임어택', sceneEn: 'a lone racer with a translucent ghost kart beside it and a stopwatch motif', sceneKo: '곁에 반투명 고스트 카트가 달리는 홀로 선 레이서와 스톱워치 모티프' },
  { id: 'custom', en: 'Custom Room', ko: '커스텀 룸', sceneEn: 'four racers gathered at a starting grid with a blank room-code tag', sceneKo: '출발 그리드에 모인 네 명의 레이서와 빈 룸 코드 태그' },
] as const;

export const UI = [
  { id: 'ui.lobby_bg', w: 1920, h: 1080, en: 'a soft studio cyclorama backdrop with warm parchment light behind a turntable', ko: '턴테이블 뒤로 따뜻한 양피지 빛이 감도는 부드러운 스튜디오 사이클로라마 배경' },
  { id: 'ui.results_bg', w: 1920, h: 1080, en: 'a podium stage with confetti and a warm spotlight', ko: '색종이와 따뜻한 스포트라이트가 있는 시상대 무대' },
  { id: 'ui.garage_backdrop', w: 2048, h: 1024, en: 'a garage workshop wall with tools and paint swatches, soft focus', ko: '공구와 페인트 견본이 걸린 차고 작업장 벽, 부드러운 초점' },
  { id: 'ui.pattern_parchment', w: 1024, h: 1024, en: 'a subtle seamless tileable parchment paper texture in #F5F4ED', ko: '#F5F4ED 색의 은은하고 이음새 없이 반복되는 양피지 질감' },
] as const;
