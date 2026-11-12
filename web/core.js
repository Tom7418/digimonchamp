var ChampCore = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	// src/core/types.ts
	var FAMILIES = [
		"용",
		"짐승",
		"물",
		"새",
		"벌레풀",
		"기계",
		"성",
		"암흑"
	];
	var ATTRS = [
		"백신",
		"데이터",
		"바이러스"
	];
	var STAT_KEYS = [
		"hp",
		"tp",
		"atk",
		"def",
		"int",
		"spd"
	];
	var STAT_LABEL = {
		hp: "HP",
		tp: "TP",
		atk: "공격",
		def: "방어",
		int: "지능",
		spd: "민첩"
	};
	var PERSONALITIES = [
		"솔직",
		"쿨",
		"열혈",
		"대담",
		"겁쟁이",
		"게으름",
		"성급한",
		"제멋대로"
	];
	// src/data/evolutions.txt?raw
	var evolutions_default = "# 단계|이름|진화체:조건,진화체:조건 ...   (위에서부터 우선순위)\r\n# 조건: 종족/속성 수치(용20), 배틀N, 승률N, 페널티N, 에그N(디지에그화 횟수), 시간(수명까지 유지)\r\n# 출처: 공개 공략 위키의 진화 목록을 게임 규칙 데이터로 옮긴 것\r\n1|즈루몬|카프리몬:기계20,퍼그몬:암흑20,모티몬:시간\r\n1|뽈뽈몬|모티몬:기계20,퍼그몬:암흑20,카프리몬:시간\r\n1|새싹몬|어니몬:벌레풀20,코로몬:용20,시드몬:시간\r\n1|뽀글몬|모티몬:벌레풀20,어니몬:새20,시드몬:시간\r\n1|피치몬|둥실몬:물20,뿔몬:짐승20,토코몬:시간\r\n1|푸치몬|베비도몬:시간\r\n1|푸니몬|둥실몬:물20,야옹몬:짐승20,쁘띠메라몬:시간\r\n1|깜몬|토코몬:성20,퍼그몬:암흑20,코로몬:시간\r\n1|포요몬|토코몬:성20,둥실몬:물20,야옹몬:짐승20,모티몬:시간\r\n1|모크몬|카프리몬:기계20,코로몬:용20,산몬:성20,쁘띠메라몬:시간\r\n1|하얀몬|뿔몬:짐승20,문몬:암흑20,야옹몬:시간\r\n1|유라몬|쁘띠메라몬:기계20,코로몬:용20,시드몬:시간\r\n2|카프리몬|아르마몬:배틀3,울퉁몬:기계20,토이아구몬:용20,톱니몬:시간\r\n2|코로몬|브이몬:용20+배틀3,스노우아구몬:물20,크로아구몬:암흑20,아구몬:배틀3,토이아구몬:시간\r\n2|산몬|길몬:용20,플롯트몬:암흑20,코로나몬:시간\r\n2|시드몬|플로라몬:벌레풀20,오로라몬:배틀3,머슈몬:페널티3,팔몬:시간\r\n2|뿔몬|가오몬:배틀3,파피몬:짐승20,사이케몬:데이터10+페널티3,에렉몬:시간\r\n2|토코몬|브이몬:용20+배틀3,테이파몬:배틀3,테리어몬:짐승20,파닥몬:시간\r\n2|야옹몬|테리어몬:짐승20,플롯트몬:배틀3,기자몬:물20,레나몬:시간\r\n2|퍼그몬|가지몬:짐승30,피코데블몬:암흑20,고부리몬:배틀3,츄카이몬:시간\r\n2|어니몬|팔코몬:배틀3,플로라몬:벌레풀20,피코데블몬:암흑20,피요몬:시간\r\n2|둥실몬|쉬라몬:배틀3,거북몬:물20,스노우아구몬:용20,기자몬:시간\r\n2|쁘띠메라몬|길몬:용20,코로나몬:배틀4,피코데블몬:암흑20,캔들몬:시간\r\n2|베비도몬|올챙몬:페널티3,드라코몬:시간\r\n2|문몬|크로아구몬:배틀3,가지몬:물20,루나몬:시간\r\n2|모티몬|거북몬:물20,텐타몬:벌레풀20,쿠네몬:시간\r\n3|아구몬|지오그레이몬:용20+배틀6,그레이몬:배틀6,스카몬:페널티4,티라노몬:시간\r\n3|아르마몬|모노크로몬:용20+배틀6,쉘몬:물20,황금아르마몬:짐승20,토타몬:시간\r\n3|오로라몬|블랙구미호몬:배틀6,레드베지몬:벌레풀20,키위몬:새20,위자몬:시간\r\n3|에렉몬|구미호몬:짐승20,번개콩알몬:기계20,켄터스몬:배틀4,레드베지몬:시간\r\n3|올챙몬|연체몬:배틀4,개굴몬:물20,레어몬:시간\r\n3|가오몬|가오가몬:배틀6,켄터스몬:짐승20,가르고몬:시간\r\n3|가지몬|데블드라몬:암흑20+배틀6,가루몬(흑):짐승20,워매몬:페널티4,링스몬:시간\r\n3|파피몬|원뿔몬:물20,가루몬(흑):바이러스20,구루몬:배틀6,가루몬:시간\r\n3|거북몬|원뿔몬:배틀6,토타몬:물20,아이스몬:기계20,쉘몬:시간\r\n3|기자몬|데블드라몬:배틀6,시드라몬:암흑20,쉘몬:물20,연체몬:시간\r\n3|캔들몬|메라몬:배틀6,타임몬:기계20+에그1,레드베지몬:페널티4,링스몬:시간\r\n3|길몬|메라몬:기계20,그라우몬:배틀6,옐로우워매몬:페널티4,다크티라노몬:시간\r\n3|쿠네몬|캅테리몬:벌레풀20,레드베지몬:바이러스10,번개콩알몬:기계20,베지몬:시간\r\n3|크로아구몬|데블드라몬:암흑20,그레이몬:배틀6,다크티라노몬:용20,모노크로몬:시간\r\n3|울퉁몬|가드로몬:배틀6,스타몬:기계20,아이스몬:물20,옐로우워매몬:시간\r\n3|고부리몬|데블몬:배틀6,켄터스몬:짐승20,위자몬:데이터10,우가몬:시간\r\n3|쉬라몬|원뿔몬:배틀6,프리지몬:물20,구루몬:짐승20,모털몬:시간\r\n3|코로나몬|메라몬:기계20,파이라몬:배틀5,링스몬:시간\r\n3|사이케몬|블랙구미호몬:짐승20,구루몬:배틀6,스타몬:시간\r\n3|츄카이몬|데블몬:배틀6,블랙버드라몬:새20,위자몬:암흑20,고스몬:시간\r\n3|테리어몬|다르크몬:성20,가르고몬:배틀6,유니몬:짐승20,가트몬:시간\r\n3|텐타몬|캅테리몬:배틀6,쿠가몬:벌레풀20,우드몬:페널티4,니드몬:시간\r\n3|토이아구몬|메라몬:용20,타임몬:기계20,스타몬:성20,스카몬:시간\r\n3|드라코몬|코어드라몬(청):백신30+배틀5,코어드라몬(녹):바이러스30+배틀5,다크티라노몬:시간\r\n3|테이파몬|다르크몬:배틀6,화이트위자몬:성20,유니몬:짐승20,고스몬:시간\r\n3|톱니몬|가드로몬:배틀6,타임몬:기계20,고스몬:페널티4,스타몬:시간\r\n3|파닥몬|엔젤몬:배틀6,위자몬:데이터10,켄터스몬:짐승20,구미호몬:시간\r\n3|팔몬|키위몬:새20,니드몬:벌레풀20,스카몬:페널티4,베지몬:시간\r\n3|피코데블몬|데블몬:배틀6,블랙버드라몬:암흑20,고스몬:시간\r\n3|피요몬|에어드라몬:용20+배틀6,버드라몬:새20,블랙버드라몬:암흑20,레드꼬끼몬:시간\r\n3|팔코몬|페크몬:배틀6,에어드라몬:용20,고스몬:페널티4,블랙버드라몬:시간\r\n3|브이몬|시드라몬:물20,브이드라몬:배틀6,레어몬:페널티4,에어드라몬:시간\r\n3|플롯트몬|엔젤몬:성20,다르크몬:배틀6,유니몬:짐승20,가트몬:시간\r\n3|플로라몬|블랙구미호몬:배틀6,니드몬:벌레풀20,엔젤몬:성20,베지몬:시간\r\n3|머슈몬|쿠가몬:배틀6,우드몬:벌레풀20,레드베지몬:시간\r\n3|스노우아구몬|아이스데블몬:배틀6,시드라몬:물20,고스몬:페널티4,프리지몬:시간\r\n3|루나몬|프리지몬:물20,레키스몬:배틀5,가트몬:시간\r\n3|레나몬|레오몬:배틀6+에그1,블랙구미호몬:암흑20,구미호몬:짐승20,스카몬:시간\r\n4|아이스데블몬|크레세몬:암흑40,블루메라몬:배틀10,레이디데블몬:시간\r\n4|아이스몬|블루메라몬:기계40,다이버몬:물40,왕콩알몬:시간\r\n4|레드꼬끼몬|가루다몬:새40+배틀8,팬텀몬:암흑40,뿌띠몬:시간\r\n4|황금아르마몬|트리세라몬:배틀8,스콜피온몬:물30,스컬그레이몬:시간\r\n4|원뿔몬|쥬드몬:배틀10+승률50,고래몬:물40,다이버몬:시간\r\n4|위자몬|팬텀몬:암흑30,레이디데블몬:배틀8,베이더몬:시간\r\n4|우드몬|피콜몬:성40,쥬레이몬:벌레풀40,뿌띠몬:시간\r\n4|에어드라몬|사이버드라몬:용40+배틀8,패롯몬:새40,뿌띠몬:시간\r\n4|엔젤몬|홀리엔젤몬:배틀10+승률50,엔젤우몬:성40,피콜몬:시간\r\n4|우가몬|나쁜퍼펫몬:배틀8,에테몬:페널티4,팬더몬:시간\r\n4|가오가몬|마하가오가몬:배틀10,워가루몬:짐승40,팬더몬:시간\r\n4|캅테리몬|아트라캅테리몬:벌레풀40+배틀8,스콜피온몬:물30,쥬레이몬:시간\r\n4|가드로몬|사이버드라몬:배틀10+승률50,안드로몬:기계40,왕콩알몬:시간\r\n4|가르고몬|래비드몬:짐승40,블랙래비드몬:배틀8,팬더몬:시간\r\n4|가루몬|워가루몬:배틀8,래비드몬:짐승40,퍼펫몬:시간\r\n4|가루몬(흑)|워가루몬(흑):배틀8,블랙래비드몬:짐승40,나쁜퍼펫몬:시간\r\n4|키위몬|패롯몬:새40,가루다몬:배틀10,뿌띠몬:시간\r\n4|구미호몬|퍼펫몬:배틀10,가루다몬:새40+배틀8,쥬레이몬:시간\r\n4|그라우몬|메가드라몬:배틀10+승률50,메탈그레이몬(청):용40,스컬그레이몬:시간\r\n4|구루몬|홀리엔젤몬:배틀10+승률50,래비드몬:짐승40,맘모스몬:시간\r\n4|그레이몬|메탈그레이몬:배틀10,메탈그레이몬(청):백신30+배틀8,스컬그레이몬:시간\r\n4|타임몬|메탈티라노몬:용40+배틀8,왕콩알몬:암흑40,콩알몬:시간\r\n4|쿠가몬|오쿠와몬:벌레풀40+배틀8,쥬레이몬:시간\r\n4|개굴몬|고래몬:배틀10+승률50,왕개굴몬:물40,다이버몬:시간\r\n4|연체몬|드라고몬:물40,메가시드라몬:배틀8,베이더몬:시간\r\n4|옐로우워매몬|팬텀몬:배틀10,슈퍼스타몬:암흑20,베이더몬:시간\r\n4|켄터스몬|마하가오가몬:짐승40+배틀8,안드로몬:기계40,맘모스몬:시간\r\n4|코어드라몬(청)|윙드라몬:배틀10+승률50,사이버드라몬:시간\r\n4|코어드라몬(녹)|그라운드라몬:배틀10+승률50,트리세라몬:시간\r\n4|꼬끼몬|패롯몬:새40,피콜몬:성40,뿌띠몬:시간\r\n4|번개콩알몬|나이트몬:배틀8,왕콩알몬:기계40,콩알몬:시간\r\n4|쉘몬|트리세라몬:배틀8,스콜피온몬:물40,왕개굴몬:시간\r\n4|시드라몬|메가시드라몬:물40+배틀8,메가드라몬:배틀10,드라고몬:시간\r\n4|지오그레이몬|라이즈그레이몬:배틀10+승률50,메탈그레이몬:용40,맘모스몬:시간\r\n4|스카몬|에테몬:배틀8,슈퍼스타몬:기계40,가비지몬:시간\r\n4|스타몬|슈퍼스타몬:기계40,베이더몬:시간\r\n4|블랙버드라몬|사이버드라몬:배틀10+승률50,야타가라몬:새40,팬텀몬:시간\r\n4|화이트위자몬|팬텀몬:암흑40,엔젤우몬:성40,피콜몬:시간\r\n4|다크티라노몬|메탈그레이몬(청):용40+배틀8,메가드라몬:기계40+배틀10+승률50,메탈티라노몬:시간\r\n4|다르크몬|엔젤우몬:성40,레이디데블몬:암흑20+배틀10+승률50,피콜몬:시간\r\n4|티라노몬|메탈티라노몬:기계40+배틀8,메탈그레이몬:배틀10,스컬그레이몬:시간\r\n4|가트몬|홀리엔젤몬:성40,워가루몬:짐승40,팬더몬:시간\r\n4|데블드라몬|메가드라몬:배틀10+승률50,사이버드라몬:기계40,스컬그레이몬:시간\r\n4|데블몬|레이디데블몬:암흑40,데드메라몬:배틀10+승률50,팬텀몬:시간\r\n4|토타몬|쥬드몬:배틀8+승률50,스콜피온몬:물40,트리세라몬:시간\r\n4|니드몬|릴리몬:벌레풀40+배틀8,피콜몬:성40,뿌띠몬:시간\r\n4|워매몬|고래몬:물40,가비지몬:시간\r\n4|버드라몬|가루다몬:배틀8,야타가라몬:새40,패롯몬:시간\r\n4|고스몬|데드메라몬:배틀10,팬텀몬:시간\r\n4|파이라몬|플레어몬:배틀10,퍼펫몬:시간\r\n4|브이드라몬|사이버드라몬:배틀10+승률50,메탈그레이몬:용40,맘모스몬:시간\r\n4|베지몬|쥬레이몬:벌레풀40,아트라캅테리몬:배틀10+승률50,베이더몬:시간\r\n4|페크몬|야타가라몬:새40,사이버드라몬:기계40+배틀8,뿌띠몬:시간\r\n4|메라몬|데드메라몬:배틀10+승률50,블루메라몬:기계40,에테몬:시간\r\n4|모털몬|블루메라몬:물40,맘모스몬:짐승40,팬더몬:시간\r\n4|모노크로몬|트리세라몬:배틀8,메탈티라노몬:용40,스컬그레이몬:시간\r\n4|프리지몬|블루메라몬:기계40,퍼펫몬:짐승40,팬더몬:시간\r\n4|유니몬|마하가오가몬:배틀8+승률50,래비드몬:짐승40,맘모스몬:시간\r\n4|블랙구미호몬|데드메라몬:배틀10+승률50,블랙래비드몬:짐승40,레이디데블몬:시간\r\n4|링스몬|플레어몬:성40+배틀8,블랙래비드몬:짐승40,퍼펫몬:시간\r\n4|레어몬|드라고몬:물40,가비지몬:시간\r\n4|레오몬|퍼펫몬:배틀10+승률50,나쁜퍼펫몬:시간\r\n4|레키스몬|크레세몬:배틀10,나쁜퍼펫몬:시간\r\n4|레드베지몬|쥬레이몬:벌레풀40,베이더몬:시간\r\n5|아트라캅테리몬|헤라크레스캅테리몬:벌레풀60+배틀18+승률50+에그1\r\n5|스콜피온몬|푸쿠몬:시간\r\n5|안드로몬|하이안드로몬:기계60+배틀14+승률50\r\n5|윙드라몬|슬레이어드라몬:백신60+배틀18+승률50+에그1\r\n5|에테몬|메탈에테몬:바이러스50+배틀14+승률50\r\n5|엔젤우몬|발키리몬:새50+배틀12,페닉스몬:새40+에그1\r\n5|오쿠와몬|그랜쿠가몬:벌레풀50+배틀16+승률50+에그1\r\n5|가비지몬|메탈에테몬:바이러스60+기계60\r\n5|가루다몬|페닉스몬:새50+배틀16+에그1,발키리몬:시간\r\n5|그라운드라몬|브레이크드라몬:바이러스60+배틀18+승률50+에그1\r\n5|크레세몬|다이아나몬:암흑40+배틀20+승률50+에그1\r\n5|사이버드라몬|블랙워그레이몬:바이러스50+용50+배틀18,황제드라몬:용50+배틀16+승률50+에그2\r\n5|쥬레이몬|피노키몬:바이러스60+기계60\r\n5|스컬그레이몬|스컬맘모스몬:시간\r\n5|쥬드몬|바이킹몬:물60+배틀18+승률50\r\n5|슈퍼스타몬|프린스콩알몬:시간\r\n5|드라고몬|기가시드라몬:물40+기계40+배틀12,푸쿠몬:시간\r\n5|데드메라몬|피에몬:바이러스30+배틀18+승률50\r\n5|뿌띠몬|프린스콩알몬:데이터60+배틀12\r\n5|왕개굴몬|기가시드라몬:시간+에그3\r\n5|트리세라몬|세인트가르고몬:기계60+배틀18+승률50\r\n5|나이트몬|발키리몬:새60+배틀14\r\n5|패롯몬|이글몬:시간\r\n5|다이버몬|푸쿠몬:시간\r\n5|팬더몬|미러지가오몬:짐승40+배틀22+승률50+에그1,스컬맘모스몬:시간\r\n5|왕콩알몬|프린스콩알몬:기계80\r\n5|피콜몬|로제몬:데이터40+벌레풀60+에그1\r\n5|팬텀몬|파라오몬:시간\r\n5|블랙래비드몬|세인트가르고몬:배틀20+승률50\r\n5|블루메라몬|파라오몬:배틀16\r\n5|플레어몬|아폴로몬:성40+배틀20+승률50+에그1\r\n5|베이더몬|\r\n5|홀리엔젤몬|페닉스몬:새60+배틀16+승률50+에그1\r\n5|고래몬|프레시오몬:물60+배틀14,메탈시드라몬:배틀10+에그3\r\n5|마하가오가몬|미러지가오몬:배틀22+승률50+에그1\r\n5|콩알몬|프린스콩알몬:기계80,파워드라몬:기계40+에그5\r\n5|맘모스몬|스컬맘모스몬:시간\r\n5|메가시드라몬|메탈시드라몬:배틀14+승률50+에그1,기가시드라몬:물50+배틀16\r\n5|메가드라몬|듀크몬:바이러스60+배틀22+승률50+에그2\r\n5|메탈그레이몬(청)|블랙워그레이몬:용60+배틀14+승률50+에그1\r\n5|메탈그레이몬|워그레이몬:용60+배틀14+승률50+에그1,빅토리그레이몬:배틀30+승률50+에그2\r\n5|메탈티라노몬|파워드라몬:바이러스60+배틀20+에그2\r\n5|퍼펫몬|반쵸레오몬:짐승60+배틀20+승률70+에그1,샤벨레오몬:시간\r\n5|야타가라몬|페닉스몬:새60+배틀12+승률50+에그2,그리폰몬:시간\r\n5|라이즈그레이몬|샤잉레이몬:백신40+용40+배틀18+승률50+에그1,빅토리그레이몬:배틀30+승률50+에그2\r\n5|래비드몬|세인트가르고몬:배틀18+승률70\r\n5|릴리몬|로제몬:벌레풀70+배틀14+승률50\r\n5|레이디데블몬|피에몬:바이러스60+암흑60\r\n5|워가루몬|지드가루몬:배틀16+승률50+에그2,메탈가루몬:데이터40+배틀20\r\n5|워가루몬(흑)|지드가루몬:배틀16+승률50+에그2,메탈가루몬(흑):바이러스40+배틀20\r\n5|나쁜퍼펫몬|피노키몬:기계60+암흑60\r\n";
	// src/core/data.ts
	var STAGE_LABEL = {
		1: "유년기I",
		2: "유년기II",
		3: "성장기",
		4: "성숙기",
		5: "완전체",
		6: "궁극체"
	};
	/** 단계별 수명(게임 분) */
	var LIFESPAN = {
		1: 720,
		2: 1440,
		3: 4320,
		4: 7200,
		5: 11520,
		6: 14400
	};
	var EGG_MINUTES = 30;
	var isFamily = (s) => FAMILIES.includes(s);
	var isAttr = (s) => ATTRS.includes(s);
	function parseCond(text) {
		const c = {};
		for (const tok of text.split("+")) {
			const m = /^(\D+?)(\d+)?$/.exec(tok.trim());
			if (!m) continue;
			const [, key, numText] = m;
			const n = Number(numText ?? 0);
			if (key === "시간") c.time = true;
			else if (key === "배틀") c.battles = n;
			else if (key === "승률") c.winRate = n;
			else if (key === "페널티") c.penalties = n;
			else if (key === "에그") c.eggs = n;
			else if (isFamily(key) || isAttr(key)) (c.ap ??= {})[key] = n;
			else throw new Error(`알 수 없는 진화 조건: ${tok}`);
		}
		return c;
	}
	function hash(s) {
		let h = 0;
		for (const ch of s) h = h * 31 + ch.charCodeAt(0) >>> 0;
		return h;
	}
	function build() {
		const out = {};
		const famVotes = {};
		const attrVotes = {};
		const parent = {};
		const ensure = (name, stage) => out[name] ??= {
			id: name,
			name,
			stage,
			family: "짐승",
			attr: "데이터",
			size: 0,
			evos: []
		};
		const vote = (name, cond, w) => {
			for (const [k, v] of Object.entries(cond.ap ?? {})) if (isFamily(k)) (famVotes[name] ??= {})[k] = (famVotes[name][k] ?? 0) + v * w;
			else (attrVotes[name] ??= {})[k] = (attrVotes[name][k] ?? 0) + v * w;
		};
		for (const line of evolutions_default.split(/\r?\n/)) {
			if (!line.trim() || line.startsWith("#")) continue;
			const [stageText, name, evoText] = line.split("|");
			const stage = Number(stageText);
			const sp = ensure(name, stage);
			sp.stage = stage;
			for (const part of (evoText ?? "").split(",").filter(Boolean)) {
				const [to, condText] = part.split(":");
				const cond = parseCond(condText);
				sp.evos.push({
					to,
					cond
				});
				ensure(to, Math.min(6, stage + 1));
				parent[to] ??= name;
				vote(to, cond, 2);
				vote(name, cond, 1);
			}
		}
		const top = (v) => {
			const e = Object.entries(v ?? {});
			return e.length ? e.sort((a, b) => b[1] - a[1])[0][0] : null;
		};
		const ordered = Object.values(out).sort((a, b) => a.stage - b.stage);
		for (const sp of ordered) {
			const p = parent[sp.id] ? out[parent[sp.id]] : null;
			sp.family = top(famVotes[sp.id]) ?? (p && sp.stage > 2 ? p.family : FAMILIES[hash(sp.id) % FAMILIES.length]);
			sp.attr = top(attrVotes[sp.id]) ?? ATTRS[hash(sp.id + "속성") % ATTRS.length];
			const dragon = sp.family === "용";
			sp.size = {
				1: 4,
				2: 6,
				3: 10,
				4: 16,
				5: dragon ? 24 : 20,
				6: dragon ? 32 : 24
			}[sp.stage];
		}
		return out;
	}
	var SPECIES = build();
	function getSpecies(id) {
		const s = SPECIES[id];
		if (!s) throw new Error(`Unknown species: ${id}`);
		return s;
	}
	/** 종족별 능력치 성향 (합 6) */
	var PROFILE = {
		용: {
			hp: 1.1,
			tp: .7,
			atk: 1.5,
			def: 1,
			int: .8,
			spd: .9
		},
		짐승: {
			hp: 1,
			tp: .7,
			atk: 1.2,
			def: .8,
			int: .8,
			spd: 1.5
		},
		물: {
			hp: 1.4,
			tp: .9,
			atk: .9,
			def: 1.3,
			int: .9,
			spd: .6
		},
		새: {
			hp: .8,
			tp: 1,
			atk: 1,
			def: .7,
			int: 1.1,
			spd: 1.4
		},
		벌레풀: {
			hp: 1.2,
			tp: .9,
			atk: 1,
			def: 1.3,
			int: .8,
			spd: .8
		},
		기계: {
			hp: 1,
			tp: .8,
			atk: 1.2,
			def: 1.5,
			int: .9,
			spd: .6
		},
		성: {
			hp: .9,
			tp: 1.4,
			atk: .8,
			def: .9,
			int: 1.4,
			spd: .6
		},
		암흑: {
			hp: .9,
			tp: 1.2,
			atk: 1.2,
			def: .7,
			int: 1.3,
			spd: .7
		}
	};
	var STAGE_BONUS = {
		1: 8,
		2: 10,
		3: 25,
		4: 55,
		5: 110,
		6: 200
	};
	/** 해당 종으로 진화(또는 부화)할 때 더해지는 능력치 */
	function evolutionBonus(id) {
		const sp = getSpecies(id);
		const p = PROFILE[sp.family];
		const b = STAGE_BONUS[sp.stage];
		return {
			hp: Math.round(p.hp * b),
			tp: Math.round(p.tp * b),
			atk: Math.round(p.atk * b),
			def: Math.round(p.def * b),
			int: Math.round(p.int * b),
			spd: Math.round(p.spd * b)
		};
	}
	/** 야생/상대 디지몬의 표준 능력치 */
	function typicalStats(id, scale = 1) {
		const sp = getSpecies(id);
		const total = [
			0,
			8,
			18,
			45,
			110,
			240,
			460
		][sp.stage] * scale;
		const p = PROFILE[sp.family];
		return {
			hp: Math.round(p.hp * total),
			tp: Math.round(p.tp * total),
			atk: Math.round(p.atk * total),
			def: Math.round(p.def * total),
			int: Math.round(p.int * total),
			spd: Math.round(p.spd * total)
		};
	}
	var speciesByStage = (stage) => Object.values(SPECIES).filter((s) => s.stage === stage);
	var SEASONS = [
		"봄",
		"여름",
		"가을",
		"겨울"
	];
	/** 한 계절 8일 (원작 달력 화면 1~8일 확인) */
	var DAYS_PER_SEASON = 8;
	/** 하루는 아침 7시에 시작해 밤 9시에 끝난다 (밤 9시 마감은 영상 확인, 7시 시작은 임시) */
	var DAY_START_HOUR = 7;
	var DAY_END_HOUR = 21;
	var MIN_PER_DAY = 1440;
	var START_CLOCK = 480;
	function dateOf(clock) {
		const dayIndex = Math.floor(clock / MIN_PER_DAY);
		const year = Math.floor(dayIndex / 32) + 1;
		const season = Math.floor(dayIndex / 8) % 4;
		const day = dayIndex % 8 + 1;
		const hour = Math.floor(clock % MIN_PER_DAY / 60);
		const minute = clock % 60;
		return {
			dayIndex,
			year,
			season,
			seasonName: SEASONS[season],
			day,
			hour,
			minute
		};
	}
	var CAGES = [
		{
			id: "기본 케이지",
			price: 0,
			minRank: 1,
			capacity: 99
		},
		{
			id: "미니 양호실",
			price: 0,
			minRank: 1,
			capacity: 2,
			rest: true
		},
		{
			id: "공터",
			price: 0,
			minRank: 1,
			capacity: 2,
			up: ["def"],
			down: ["atk"],
			apUp: ["벌레풀"],
			apDown: ["기계"]
		},
		{
			id: "미니 운동장",
			price: 0,
			minRank: 1,
			capacity: 2,
			up: ["hp"],
			down: ["tp"],
			apUp: ["짐승"],
			apDown: ["용"]
		},
		{
			id: "미니 체육관",
			price: 300,
			minRank: 1,
			capacity: 2,
			up: ["atk"],
			down: ["def"],
			apUp: ["기계"],
			apDown: ["벌레풀"]
		},
		{
			id: "미니 화산",
			price: 400,
			minRank: 1,
			capacity: 2,
			up: ["atk"],
			down: ["def"],
			apUp: ["용"],
			apDown: ["짐승"]
		},
		{
			id: "미니 화원",
			price: 400,
			minRank: 1,
			capacity: 2,
			up: ["int"],
			down: ["atk"],
			apUp: ["성", "벌레풀"],
			apDown: ["암흑", "기계"]
		},
		{
			id: "미니 수영장",
			price: 400,
			minRank: 1,
			capacity: 2,
			up: ["hp"],
			down: ["spd"],
			apUp: ["물"],
			apDown: ["새"],
			supplemental: true
		},
		{
			id: "미니 새장",
			price: 400,
			minRank: 1,
			capacity: 2,
			up: ["spd"],
			down: ["def"],
			apUp: ["새"],
			apDown: ["물"],
			supplemental: true
		},
		{
			id: "미니 묘지",
			price: 400,
			minRank: 1,
			capacity: 2,
			up: ["int"],
			down: ["hp"],
			apUp: ["암흑"],
			apDown: ["성"],
			supplemental: true
		},
		{
			id: "백신 연구실",
			price: 800,
			minRank: 2,
			capacity: 2,
			up: ["tp"],
			apUp: ["백신"],
			apDown: ["바이러스"],
			supplemental: true
		},
		{
			id: "데이터 연구실",
			price: 800,
			minRank: 2,
			capacity: 2,
			up: ["tp"],
			apUp: ["데이터"],
			apDown: ["백신"],
			supplemental: true
		},
		{
			id: "바이러스 연구실",
			price: 800,
			minRank: 2,
			capacity: 2,
			up: ["tp"],
			apUp: ["바이러스"],
			apDown: ["데이터"],
			supplemental: true
		},
		{
			id: "운동장",
			price: 1500,
			minRank: 3,
			capacity: 6,
			up: ["spd"],
			supplemental: false
		}
	];
	var getCage = (id) => CAGES.find((c) => c.id === id) ?? CAGES[0];
	var START_CAGES = [
		"기본 케이지",
		"미니 양호실",
		"공터",
		"미니 운동장"
	];
	var FIELDS = [
		{
			id: "다이나 초원",
			minRank: 1,
			fee: 0,
			spawns: [
				["새싹몬", "봄"],
				["뽀글몬", "가겨"],
				["푸니몬", "봄"],
				["포요몬", "가겨"],
				["뿔몬", "봄"],
				["토코몬", "가겨"],
				["야옹몬", "봄여"],
				["어니몬", "봄여"]
			]
		},
		{
			id: "미끌미끌 늪",
			minRank: 1,
			fee: 0,
			spawns: [
				["즈루몬", "봄여"],
				["뽀글몬", "봄가겨"],
				["피치몬", "봄여가겨"],
				["포요몬", "봄여겨"],
				["시드몬", "봄"],
				["둥실몬", "가겨"],
				["모티몬", "봄겨"]
			]
		},
		{
			id: "모쥬라의 숲",
			minRank: 2,
			fee: 100,
			spawns: [
				["즈루몬", "가겨"],
				["새싹몬", "봄"],
				["뽀글몬", "가겨"],
				["유라몬", "가겨"],
				["시드몬", "봄"],
				["야옹몬", "봄여"],
				["퍼그몬", "봄여"]
			]
		},
		{
			id: "하수도",
			minRank: 2,
			fee: 100,
			spawns: [
				["즈루몬", "여가"],
				["뽈뽈몬", "봄여가"],
				["포요몬", "봄가"],
				["카프리몬", "봄"]
			]
		},
		{
			id: "이글이글 사막",
			minRank: 3,
			fee: 200,
			spawns: [
				["즈루몬", "가"],
				["푸니몬", "봄여"],
				["모크몬", "봄여"],
				["카프리몬", "가"],
				["뿔몬", "봄"],
				["쁘띠메라몬", "봄"],
				["문몬", "가"]
			]
		},
		{
			id: "대초원",
			minRank: 3,
			fee: 200,
			spawns: [
				["뽈뽈몬", "여"],
				["새싹몬", "봄가"],
				["깜몬", "봄가겨"]
			]
		},
		{
			id: "용암지대",
			minRank: 4,
			fee: 300,
			spawns: [
				["깜몬", "여"],
				["모크몬", "봄여가"],
				["코로몬", "봄여"]
			]
		},
		{
			id: "부츠 정글",
			minRank: 4,
			fee: 300,
			spawns: [
				["시드몬", "봄여"],
				["어니몬", "가"],
				["모티몬", "가"]
			]
		},
		{
			id: "눈의 왕국",
			minRank: 5,
			fee: 400,
			spawns: [["하얀몬", "겨"], ["둥실몬", "여겨"]]
		},
		{
			id: "잉카 유적",
			minRank: 5,
			fee: 400,
			spawns: [
				["산몬", "여"],
				["문몬", "가"],
				["유라몬", "가"]
			]
		}
	];
	var SEASON_CODE = [
		"봄",
		"여",
		"가",
		"겨"
	];
	// src/core/evolution.ts
	/** 디지에그화를 거칠수록 요구 수치가 조금씩 줄어든다 */
	var reqScale = (d) => Math.max(.7, 1 - .05 * d.eggs);
	function explain(d, cond) {
		const out = [];
		const k = reqScale(d);
		for (const [key, v] of Object.entries(cond.ap ?? {})) {
			const need = Math.ceil(v * k);
			out.push({
				label: `${key} ${need} 이상 (현재 ${Math.floor(d.ap[key])})`,
				met: d.ap[key] >= need
			});
		}
		if (cond.battles !== void 0) out.push({
			label: `배틀 ${cond.battles}회 이상 (현재 ${d.battles})`,
			met: d.battles >= cond.battles
		});
		if (cond.winRate !== void 0) {
			const rate = d.battles ? Math.round(d.wins / d.battles * 100) : 0;
			out.push({
				label: `승률 ${cond.winRate}% 이상 (현재 ${rate}%)`,
				met: rate >= cond.winRate
			});
		}
		if (cond.penalties !== void 0) out.push({
			label: `페널티(발병) ${cond.penalties}회 이상 (현재 ${d.penalties})`,
			met: d.penalties >= cond.penalties
		});
		if (cond.eggs !== void 0) out.push({
			label: `디지에그화 ${cond.eggs}회 이상 (현재 ${d.eggs})`,
			met: d.eggs >= cond.eggs
		});
		if (cond.time) {
			const life = LIFESPAN[getSpecies(d.speciesId).stage];
			out.push({
				label: "수명이 다할 때까지 다른 조건을 채우지 않음",
				met: d.stageAge >= life
			});
		}
		return out;
	}
	var meets = (d, cond) => explain(d, cond).every((c) => c.met);
	/** 테이머 랭크로 진화 가능한 최대 세대 */
	function maxStageForRank(rank) {
		if (rank >= 8) return 6;
		if (rank >= 6) return 5;
		if (rank >= 4) return 4;
		return 3;
	}
	/** 지금 진화할 대상. freeCapacity는 사육 용량의 남은 G */
	function findEvolution(d, rank, freeCapacity) {
		if (d.isEgg) return null;
		const sp = getSpecies(d.speciesId);
		const life = LIFESPAN[sp.stage];
		if (d.stageAge < life * .2) return null;
		for (const evo of sp.evos) {
			if (!meets(d, evo.cond)) continue;
			const to = getSpecies(evo.to);
			if (to.stage > maxStageForRank(rank)) return {
				kind: "blocked",
				to: evo.to,
				reason: "rank"
			};
			if (to.size - sp.size > freeCapacity) return {
				kind: "blocked",
				to: evo.to,
				reason: "capacity"
			};
			return {
				kind: "evolve",
				to: evo.to
			};
		}
		return null;
	}
	/** 수명이 다했는데 진화하지 못한 경우: 완전체 이상이거나 배틀 10회 이상이면 디지에그화, 아니면 로스트 */
	function endOfLife(d) {
		return getSpecies(d.speciesId).stage >= 5 || d.battles >= 10 ? "egg" : "lost";
	}
	function hints(d, seen) {
		return getSpecies(d.speciesId).evos.map((evo) => {
			const to = getSpecies(evo.to);
			const checks = explain(d, evo.cond);
			return {
				name: seen.has(to.id) ? to.name : "???",
				stage: STAGE_LABEL[to.stage],
				checks,
				ready: checks.every((c) => c.met)
			};
		});
	}
	// src/core/rng.ts
	/** 시드 고정 난수 (mulberry32). 테스트와 배틀 재현용 */
	function seeded(seed) {
		let a = seed >>> 0;
		return () => {
			a = a + 1831565813 >>> 0;
			let t = a;
			t = Math.imul(t ^ t >>> 15, t | 1);
			t ^= t + Math.imul(t ^ t >>> 7, t | 61);
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
	}
	var defaultRng = Math.random;
	var range = (rng, min, max) => min + rng() * (max - min);
	var pick = (rng, items) => items[Math.floor(rng() * items.length)];
	// src/core/titles.ts
	/**
	* 타이틀 매치. 한 번에 하나씩 순서대로 열린다 (minRank = 순번).
	* 원작 확인: 첫 타이틀 '에이스 오브 링'(봄 3일, 에이스 1:1), 세 번째 타이틀 승리 시 '레드 테이머'(성숙기 허용),
	* '인피니티 소울'의 디지에그화 10회 조건. 나머지 이름·날짜·상금은 임시 값이다.
	*/
	var TITLES = [
		{
			id: "t1",
			name: "에이스 오브 링",
			minRank: 1,
			season: 0,
			day: 3,
			format: 1,
			stage: 3,
			scale: .8,
			prize: 1e3
		},
		{
			id: "t2",
			name: "서머 컵",
			minRank: 2,
			season: 0,
			day: 6,
			format: 3,
			stage: 3,
			scale: .9,
			prize: 1500
		},
		{
			id: "t3",
			name: "오텀 컵",
			minRank: 3,
			season: 0,
			day: 8,
			format: 3,
			stage: 3,
			scale: 1,
			prize: 2e3
		},
		{
			id: "t4",
			name: "윈터 컵",
			minRank: 4,
			season: 1,
			day: 3,
			format: 1,
			stage: 4,
			scale: .9,
			prize: 3e3
		},
		{
			id: "t5",
			name: "챔피언 로드",
			minRank: 5,
			season: 1,
			day: 8,
			format: 3,
			stage: 4,
			scale: 1.1,
			prize: 4e3
		},
		{
			id: "t6",
			name: "얼티밋 컵",
			minRank: 6,
			season: 2,
			day: 3,
			format: 3,
			stage: 5,
			scale: 1,
			prize: 5e3
		},
		{
			id: "t7",
			name: "마스터 컵",
			minRank: 7,
			season: 3,
			day: 3,
			format: 3,
			stage: 5,
			scale: 1.2,
			prize: 6e3
		},
		{
			id: "t8",
			name: "레전드 컵",
			minRank: 8,
			season: 3,
			day: 8,
			format: 3,
			stage: 6,
			scale: 1,
			prize: 8e3
		},
		{
			id: "t9",
			name: "인피니티 소울",
			minRank: 9,
			season: 1,
			day: 5,
			format: 3,
			stage: 6,
			scale: 1.5,
			prize: 2e4,
			needEggs: 10
		}
	];
	/** 랭크 이름. 레드 테이머(랭크 4 = 타이틀 3개)만 영상으로 확인, 나머지는 임시 */
	function rankName(rank) {
		return [
			"",
			"루키 테이머",
			"테이머 랭크 2",
			"테이머 랭크 3",
			"레드 테이머",
			"테이머 랭크 5",
			"테이머 랭크 6",
			"테이머 랭크 7",
			"테이머 랭크 8",
			"챔피언",
			"그랜드 챔피언"
		][rank] ?? `랭크 ${rank}`;
	}
	/** 랭크별 최대 사육 용량(G). 레드 테이머 96G만 영상 확인 값 */
	var CAPACITY_BY_RANK = [
		0,
		32,
		48,
		74,
		96,
		120,
		144,
		172,
		200,
		200,
		200
	];
	/** 랭크별 케이지 공간(칸). 레드 테이머 16칸만 영상 확인 값 */
	var CAGE_SPACE_BY_RANK = [
		0,
		8,
		10,
		12,
		16,
		20,
		24,
		28,
		30,
		30,
		30
	];
	var capacityOf = (save) => CAPACITY_BY_RANK[tamerRank(save)] ?? 200;
	var cageSpaceOf = (save) => CAGE_SPACE_BY_RANK[tamerRank(save)] ?? 30;
	var CHAMP_SEASON = 2;
	var PRELIM_DAYS = [
		1,
		2,
		3,
		4,
		5
	];
	var CHAMP_DAY = 5;
	var PRELIM_MIN_RANK = 4;
	var PRELIM_WINS = 3;
	var PRELIM = {
		id: "prelim",
		name: "챔피언십 예선",
		minRank: 4,
		season: 2,
		day: 1,
		format: 3,
		stage: 4,
		scale: 1.15,
		prize: 1500
	};
	var FINAL_ROUNDS = [
		{
			id: "final",
			name: "챔피언십 본선 8강",
			minRank: 1,
			season: 2,
			day: 5,
			format: 3,
			stage: 5,
			scale: 1,
			prize: 3e3
		},
		{
			id: "final",
			name: "챔피언십 본선 4강",
			minRank: 1,
			season: 2,
			day: 5,
			format: 3,
			stage: 5,
			scale: 1.2,
			prize: 5e3
		},
		{
			id: "final",
			name: "챔피언십 결승",
			minRank: 1,
			season: 2,
			day: 5,
			format: 3,
			stage: 6,
			scale: 1.1,
			prize: 1e4
		}
	];
	/** 이전 코드·테스트 호환용: 결승전 */
	var FINAL = FINAL_ROUNDS[FINAL_ROUNDS.length - 1];
	/** 올해 예선 기록 (해가 바뀌면 새로 시작) */
	function prelimOf(save, year) {
		return save.prelim && save.prelim.year === year ? save.prelim : {
			year,
			days: [],
			wins: 0
		};
	}
	function tamerRank(save) {
		const normal = TITLES.filter((t) => t.id !== "t9" && save.titles.includes(t.id)).length;
		if (save.champion) return save.titles.length >= TITLES.length ? 10 : 9;
		return Math.min(8, 1 + normal);
	}
	/** 오늘 도전할 수 있는 매치 (엔트리는 08:00~15:00) */
	function todaysMatches(save) {
		const d = dateOf(save.clock);
		if (d.hour < 8 || d.hour >= 15) return [];
		const rank = tamerRank(save);
		const out = TITLES.filter((t) => t.season === d.season && t.day === d.day && rank >= t.minRank && !save.titles.includes(t.id));
		if (d.season === 2 && !save.champion) {
			if (save.qualifiedYear !== null && d.year > save.qualifiedYear && d.day === 5) {
				const round = save.finalRound ?? 0;
				if (round < FINAL_ROUNDS.length) out.push(FINAL_ROUNDS[round]);
			} else if (save.qualifiedYear === null && rank >= 4 && PRELIM_DAYS.includes(d.day)) {
				const p = prelimOf(save, d.year);
				const left = PRELIM_DAYS.filter((x) => x >= d.day).length;
				if (!p.days.includes(d.day) && p.wins + left >= 3) out.push({
					...PRELIM,
					day: d.day,
					name: `챔피언십 예선 ${p.days.length + 1}전`
				});
			}
		}
		return out;
	}
	function upcoming(save) {
		const rank = tamerRank(save);
		const lines = TITLES.filter((t) => rank >= t.minRank && !save.titles.includes(t.id)).map((t) => `${t.name}: ${[
			"봄",
			"여름",
			"가을",
			"겨울"
		][t.season]} ${t.day}일 (${t.format}:${t.format})`);
		if (!save.champion) {
			if (save.qualifiedYear !== null) lines.push(`챔피언십 본선: ${save.qualifiedYear + 1}년차 가을 5일 (8강·4강·결승)`);
			else if (rank < 4) lines.push(`챔피언십 예선: 가을 1~5일 (${rankName(4)}부터 참가)`);
			else {
				const p = save.prelim;
				lines.push(`챔피언십 예선: 가을 1~5일, 3승 통과${p ? ` (올해 ${p.wins}승 ${p.days.length - p.wins}패)` : ""}`);
			}
		}
		return lines;
	}
	/** 매치 결과 반영. 타이틀은 이겼을 때만 의미가 있고, 예선·본선은 진 것도 기록한다 */
	function applyMatch(save, m, won) {
		const d = dateOf(save.clock);
		if (m.id === "prelim") {
			const p = prelimOf(save, d.year);
			const next = {
				year: d.year,
				days: [...p.days, d.day],
				wins: p.wins + (won ? 1 : 0)
			};
			const qualified = next.wins >= 3;
			return {
				...save,
				prelim: next,
				qualifiedYear: qualified ? d.year : save.qualifiedYear,
				bits: save.bits + (won ? m.prize : 0)
			};
		}
		if (m.id === "final") {
			if (!won) return {
				...save,
				qualifiedYear: null,
				finalRound: 0,
				prelim: null
			};
			const round = (save.finalRound ?? 0) + 1;
			const champion = round >= FINAL_ROUNDS.length;
			return {
				...save,
				finalRound: champion ? 0 : round,
				champion: save.champion || champion,
				bits: save.bits + m.prize
			};
		}
		return won ? {
			...save,
			titles: [...save.titles, m.id],
			bits: save.bits + m.prize
		} : save;
	}
	function applyWin(save, m) {
		return applyMatch(save, m, true);
	}
	// src/core/hunt.ts
	/** 사냥 가능한 시간: 08:00 ~ 22:00 (22시 이후 불가는 원작, 시작 시각은 영상 화면 08:00 기준) */
	var HUNT_OPEN_HOUR = 8;
	var HUNT_CLOSE_HOUR = 22;
	/** 성장기가 출현할 확률 (임시) */
	var ROOKIE_CHANCE = .25;
	/** 한 사냥터에 동시에 나오는 야생 디지몬 수 */
	var WILD_COUNT = 5;
	function huntFields(save) {
		const rank = tamerRank(save);
		return FIELDS.map((f) => rank >= f.minRank ? {
			...f,
			open: true
		} : {
			...f,
			open: false,
			reason: `테이머 랭크 ${f.minRank} 필요`
		});
	}
	function canHuntNow(save) {
		const { hour } = dateOf(save.clock);
		if (hour < 8) return {
			ok: false,
			reason: `사냥은 8시부터 할 수 있어요.`
		};
		if (hour >= 22) return {
			ok: false,
			reason: "22시 이후에는 사냥할 수 없어요."
		};
		return { ok: true };
	}
	/** 이 계절에 이 사냥터에 나오는 유년기와, 그 유년기II가 진화하는 성장기 */
	function huntPool(field, clock) {
		const season = SEASON_CODE[dateOf(clock).season];
		const babies = [...new Set(field.spawns.filter(([, s]) => s.includes(season)).map(([n]) => n))];
		const rookies = /* @__PURE__ */ new Set();
		for (const b of babies) {
			const sp = getSpecies(b);
			const stage2 = sp.stage === 2 ? [b] : sp.evos.map((e) => e.to).filter((id) => getSpecies(id).stage === 2);
			for (const id of stage2) for (const e of getSpecies(id).evos) if (getSpecies(e.to).stage === 3) rookies.add(e.to);
		}
		return {
			babies,
			rookies: [...rookies]
		};
	}
	function pickWild(field, clock, rng) {
		const { babies, rookies } = huntPool(field, clock);
		const list = rookies.length && rng() < .25 ? rookies : babies;
		return list[Math.floor(rng() * list.length)];
	}
	/** 로프로 몇 번 둘러야 잡히는가 */
	function wildHp(speciesId) {
		return Math.max(1, Math.min(3, getSpecies(speciesId).stage));
	}
	/** 로프로 한 번 둘렀을 때 깎이는 HP. 0이면 이 로프로는 잡을 수 없다 */
	function ropeDamage(save, speciesId) {
		const stage = getSpecies(speciesId).stage;
		if (stage >= 4) return 0;
		if (stage === 3 && save.ropeLevel < 2) return 0;
		return 1;
	}
	/** 와이어 한 묶음 (상점) */
	var WIRE_PACK = {
		count: 10,
		price: 100
	};
	// src/core/care.ts
	/** 최대치. 실제 용량은 랭크에 따라 capacityOf(save) */
	var CAPACITY = 200;
	var OFFLINE_CAP_MINUTES = 720;
	var zeroAp = () => Object.fromEntries([...FAMILIES, ...ATTRS].map((k) => [k, 0]));
	var addStats = (a, b) => Object.fromEntries(STAT_KEYS.map((k) => [k, a[k] + b[k]]));
	function newDigimon(uid, speciesId, rng = defaultRng, wild = false) {
		return {
			uid,
			speciesId,
			isEgg: false,
			originBaby: getSpecies(speciesId).stage === 1 ? speciesId : "깜몬",
			personality: pick(rng, PERSONALITIES),
			stats: wild ? typicalStats(speciesId) : evolutionBonus(speciesId),
			ap: zeroAp(),
			stageAge: 0,
			hunger: 70,
			fatigue: 0,
			poop: 0,
			sick: false,
			injured: false,
			penalties: 0,
			battles: 0,
			wins: 0,
			eggs: 0,
			cage: "기본 케이지",
			rottenEaten: 0,
			starvingMinutes: 0,
			dirtyMinutes: 0,
			sickMinutes: 0,
			poopTimer: 0
		};
	}
	function freshSave(now = Date.now()) {
		return {
			version: 2,
			clock: 480,
			bits: 500,
			meat: 10,
			pills: 2,
			rotten: 0,
			ropeLevel: 1,
			wires: 5,
			cages: [...START_CAGES],
			digimon: [{
				...newDigimon(1, "깜몬"),
				isEgg: true,
				stats: {
					hp: 0,
					tp: 0,
					atk: 0,
					def: 0,
					int: 0,
					spd: 0
				}
			}],
			titles: [],
			qualifiedYear: null,
			champion: false,
			nextUid: 2,
			seen: ["깜몬"],
			lastSavedAt: now
		};
	}
	var usedCapacity = (save) => save.digimon.reduce((s, d) => s + (d.isEgg ? 0 : getSpecies(d.speciesId).size), 0);
	function makeSick(d, events) {
		if (d.sick) return;
		d.sick = true;
		d.sickMinutes = 0;
		d.penalties += 1;
		events.push({
			type: "sick",
			uid: d.uid,
			name: getSpecies(d.speciesId).name
		});
	}
	/** countEgg=false: 병·부상 방치로 죽어 알로 돌아간 경우. 디지에그화 횟수(진화 조건)는 늘지 않는다 */
	function toEgg(d, countEgg = true) {
		return {
			...d,
			isEgg: true,
			eggs: countEgg ? d.eggs + 1 : d.eggs,
			stageAge: 0,
			stats: Object.fromEntries(STAT_KEYS.map((k) => [k, Math.round(d.stats[k] * .15)])),
			ap: zeroAp(),
			battles: 0,
			wins: 0,
			penalties: 0,
			sick: false,
			injured: false,
			poop: 0,
			hunger: 70,
			fatigue: 0,
			cage: "기본 케이지"
		};
	}
	/** 디지몬 한 마리의 게임 시간 1분. null이면 로스트 */
	function tickOne(prev, ctx, events) {
		let d = {
			...prev,
			stats: { ...prev.stats },
			ap: { ...prev.ap }
		};
		d.stageAge += 1;
		if (d.isEgg) {
			if (d.stageAge >= 30) {
				events.push({
					type: "hatched",
					uid: d.uid,
					from: "디지에그",
					to: d.originBaby
				});
				d = {
					...d,
					isEgg: false,
					speciesId: d.originBaby,
					stageAge: 0,
					stats: addStats(d.stats, evolutionBonus(d.originBaby))
				};
			}
			return d;
		}
		const sp = getSpecies(d.speciesId);
		const cage = getCage(d.cage);
		if (ctx.sleep) d.fatigue = Math.max(0, d.fatigue - .3);
		else {
			d.hunger = Math.max(0, d.hunger - (d.personality === "열혈" ? .11 : .08));
			d.fatigue = Math.max(0, d.fatigue - (cage.rest ? .5 : .04));
			d.poopTimer += 1;
		}
		if (d.poopTimer >= (sp.stage <= 2 ? 120 : 240)) {
			d.poopTimer = 0;
			if (d.poop < 5) {
				d.poop += 1;
				events.push({
					type: "poop",
					uid: d.uid
				});
			}
		}
		d.starvingMinutes = d.hunger <= 0 && !ctx.sleep ? d.starvingMinutes + 1 : 0;
		d.dirtyMinutes = d.poop >= 3 && !ctx.sleep ? d.dirtyMinutes + 1 : 0;
		if (d.starvingMinutes >= 240 || d.dirtyMinutes >= 180 || d.fatigue >= 95 && ctx.rng() < .01) {
			d.starvingMinutes = 0;
			d.dirtyMinutes = 0;
			makeSick(d, events);
		}
		if (d.sick || d.injured) {
			d.sickMinutes += 1;
			if (cage.rest && d.injured && d.sickMinutes >= 120) {
				d.injured = false;
				d.sickMinutes = d.sick ? d.sickMinutes : 0;
			}
			if (d.sickMinutes >= 2880) {
				events.push({
					type: "egg",
					uid: d.uid,
					from: sp.id,
					reason: "sick"
				});
				return toEgg(d, false);
			}
		}
		if (d.stageAge % 60 === 0) {
			if (!ctx.sleep && !d.sick && !d.injured && d.hunger > 0 && d.fatigue < 90 && (cage.up || cage.apUp)) {
				const speed = d.personality === "솔직" ? 1.3 : d.personality === "성급한" ? .8 : 1;
				const changes = [];
				for (const k of cage.up ?? []) {
					const n = Math.max(1, Math.round((1 + ctx.rng() * (sp.stage + 1)) * speed));
					d.stats[k] += n;
					changes.push(`${STAT_LABEL[k]} +${n}`);
				}
				for (const k of cage.down ?? []) {
					if (d.stats[k] > 1) changes.push(`${STAT_LABEL[k]} -1`);
					d.stats[k] = Math.max(1, d.stats[k] - 1);
				}
				if (changes.length) events.push({
					type: "trained",
					uid: d.uid,
					name: sp.name,
					changes: changes.join(", ")
				});
				for (const k of cage.apUp ?? []) d.ap[k] = Math.min(99, d.ap[k] + 3 * speed);
				for (const k of cage.apDown ?? []) d.ap[k] = Math.max(0, d.ap[k] - 1);
				d.fatigue = Math.min(100, d.fatigue + 5);
			}
			const evo = findEvolution(d, ctx.rank, ctx.free);
			if (evo?.kind === "evolve") {
				events.push({
					type: "evolved",
					uid: d.uid,
					from: sp.id,
					to: evo.to
				});
				const ap = Object.fromEntries(Object.entries(d.ap).map(([k, v]) => [k, Math.floor(v / 2)]));
				return {
					...d,
					speciesId: evo.to,
					stageAge: 0,
					stats: addStats(d.stats, evolutionBonus(evo.to)),
					ap,
					rottenEaten: 0
				};
			}
			if (d.stageAge >= LIFESPAN[sp.stage]) {
				if (evo?.kind === "blocked" && d.stageAge === LIFESPAN[sp.stage]) events.push({
					type: "blocked",
					uid: d.uid,
					name: sp.name,
					reason: evo.reason
				});
				if (d.stageAge >= LIFESPAN[sp.stage] + 1440 || !evo) {
					if (endOfLife(d) === "egg" || ctx.isLast) {
						events.push({
							type: "egg",
							uid: d.uid,
							from: sp.id
						});
						return toEgg(d);
					}
					events.push({
						type: "lost",
						uid: d.uid,
						name: sp.name,
						reason: "수명"
					});
					return null;
				}
			}
		}
		return d;
	}
	/** 사육장 전체의 게임 시간 1분 */
	function tickFarm(save, rng = defaultRng, sleep = false) {
		const events = [];
		const rank = tamerRank(save);
		let free = capacityOf(save) - usedCapacity(save);
		const next = [];
		const seen = new Set(save.seen);
		save.digimon.forEach((d, i) => {
			const before = d.isEgg ? 0 : getSpecies(d.speciesId).size;
			const isLast = next.length + (save.digimon.length - i) <= 1;
			const r = tickOne(d, {
				rank,
				free,
				isLast,
				rng,
				sleep
			}, events);
			if (!r) {
				free += before;
				return;
			}
			free -= (r.isEgg ? 0 : getSpecies(r.speciesId).size) - before;
			seen.add(r.speciesId);
			next.push(r);
		});
		return {
			save: {
				...save,
				clock: save.clock + 1,
				digimon: next,
				seen: [...seen]
			},
			events
		};
	}
	function advance(save, minutes, rng = defaultRng) {
		const events = [];
		let cur = save;
		for (let i = 0; i < minutes; i++) {
			const r = tickFarm(cur, rng);
			cur = r.save;
			events.push(...r.events);
		}
		return {
			save: cur,
			events
		};
	}
	/** 밤 9시가 지났는가 (하루 마감) */
	function isNight(save) {
		const h = dateOf(save.clock).hour;
		return h >= 21 || h < 7;
	}
	/** 달력 예고와 실제 수면 종료가 같은 날짜를 사용한다. 새벽이면 그날 아침이다. */
	function nextMorningClock(save) {
		const d = dateOf(save.clock);
		const startOfDay = save.clock - d.hour * 60 - d.minute;
		return (d.hour < 7 ? startOfDay : startOfDay + MIN_PER_DAY) + 420;
	}
	/** 웹판 임시 정책: 오프라인 진행도 하루 마감에서 멈춰 달력과 경기 날을 건너뛰지 않는다. */
	function advanceOffline(save, minutes, rng = defaultRng) {
		const limit = Number.isFinite(minutes) ? Math.min(720, Math.max(0, Math.floor(minutes))) : 0;
		const events = [];
		let cur = save;
		for (let i = 0; i < limit && !isNight(cur); i++) {
			const r = tickFarm(cur, rng);
			cur = r.save;
			events.push(...r.events);
		}
		return {
			save: cur,
			events,
			elapsedMinutes: cur.clock - save.clock
		};
	}
	/** 하루 마감: 다음 날 아침 7시까지 잠잔다 (수명·병은 흐르고, 배고픔·똥·훈련은 멈춘다) */
	function endDay(save, rng = defaultRng) {
		const morning = nextMorningClock(save);
		const events = [];
		let cur = save;
		while (cur.clock < morning) {
			const r = tickFarm(cur, rng, true);
			cur = r.save;
			events.push(...r.events);
		}
		return {
			save: cur,
			events
		};
	}
	var fail = (save, message) => ({
		ok: false,
		message,
		save
	});
	var update = (save, uid, fn) => ({
		...save,
		digimon: save.digimon.map((d) => d.uid === uid ? fn(d) : d)
	});
	var find = (save, uid) => save.digimon.find((d) => d.uid === uid);
	function feed(save, uid) {
		const d = find(save, uid);
		if (!d || d.isEgg) return fail(save, "먹이를 줄 수 없어요.");
		if (save.meat <= 0) return fail(save, "고기가 없어요. 상점에서 사세요.");
		if (d.hunger >= 100) return fail(save, "배가 불러서 안 먹어요.");
		return {
			ok: true,
			message: "고기를 먹었다.",
			save: {
				...update(save, uid, (x) => ({
					...x,
					hunger: Math.min(100, x.hunger + 35)
				})),
				meat: save.meat - 1
			}
		};
	}
	/** 썩은 고기 두 개를 먹으면 병에 걸린다 (페널티 진화용) */
	function feedRotten(save, uid) {
		const d = find(save, uid);
		if (!d || d.isEgg) return fail(save, "먹이를 줄 수 없어요.");
		if (save.rotten <= 0) return fail(save, "썩은 고기가 없어요.");
		if (d.sick) return fail(save, "이미 병에 걸려 있어요.");
		const events = [];
		const s = update(save, uid, (x) => {
			const y = {
				...x,
				hunger: Math.min(100, x.hunger + 15),
				rottenEaten: x.rottenEaten + 1
			};
			if (y.rottenEaten >= 2) {
				y.rottenEaten = 0;
				makeSick(y, events);
			}
			return y;
		});
		return {
			ok: true,
			message: events.length ? "썩은 고기를 먹고 병에 걸렸다! (페널티 +1)" : "썩은 고기를 먹었다…",
			save: {
				...s,
				rotten: save.rotten - 1
			}
		};
	}
	/** 바닥의 똥 하나 치우기 */
	function cleanOne(save, uid) {
		const d = find(save, uid);
		if (!d || d.poop === 0) return fail(save, "치울 것이 없어요.");
		return {
			ok: true,
			message: "똥을 치웠다.",
			save: update(save, uid, (x) => ({
				...x,
				poop: x.poop - 1,
				dirtyMinutes: x.poop - 1 >= 3 ? x.dirtyMinutes : 0
			}))
		};
	}
	function clean(save, uid) {
		const d = find(save, uid);
		if (!d || d.poop === 0) return fail(save, "치울 것이 없어요.");
		return {
			ok: true,
			message: "깨끗하게 치웠다!",
			save: update(save, uid, (x) => ({
				...x,
				poop: 0,
				dirtyMinutes: 0
			}))
		};
	}
	function heal(save, uid) {
		const d = find(save, uid);
		if (!d || !d.sick && !d.injured) return fail(save, "아프지 않아요.");
		if (save.pills <= 0) return fail(save, "알약이 없어요. 상점에서 사세요.");
		return {
			ok: true,
			message: "알약을 먹고 나았다.",
			save: {
				...update(save, uid, (x) => ({
					...x,
					sick: false,
					injured: false,
					sickMinutes: 0
				})),
				pills: save.pills - 1
			}
		};
	}
	function setCage(save, uid, cageId) {
		const cage = CAGES.find((c) => c.id === cageId);
		if (!cage || !save.cages.includes(cageId)) return fail(save, "가지고 있지 않은 케이지예요.");
		if (save.digimon.filter((d) => d.cage === cageId && d.uid !== uid).length >= cage.capacity) return fail(save, `${cageId}은(는) ${cage.capacity}마리까지 들어가요.`);
		return {
			ok: true,
			message: `${cageId}(으)로 옮겼다.`,
			save: update(save, uid, (x) => ({
				...x,
				cage: cageId
			}))
		};
	}
	function release(save, uid) {
		if (save.digimon.length <= 1) return fail(save, "마지막 디지몬은 놓아줄 수 없어요.");
		return {
			ok: true,
			message: "디지몬을 놓아주었다.",
			save: {
				...save,
				digimon: save.digimon.filter((d) => d.uid !== uid)
			}
		};
	}
	function capture(save, speciesId, rng = defaultRng) {
		const size = getSpecies(speciesId).size;
		if (usedCapacity(save) + size > capacityOf(save)) return fail(save, "용량이 가득 찼습니다. 디지몬을 줄여 주세요.");
		const d = newDigimon(save.nextUid, speciesId, rng, true);
		return {
			ok: true,
			message: `${getSpecies(speciesId).name}을(를) 잡았다!`,
			save: {
				...save,
				digimon: [...save.digimon, d],
				nextUid: save.nextUid + 1,
				seen: [.../* @__PURE__ */ new Set([...save.seen, speciesId])]
			}
		};
	}
	function shopItems(save) {
		const rank = tamerRank(save);
		const items = [
			{
				id: "meat",
				name: "고기 ×5",
				price: 50,
				apply: (s) => ({
					...s,
					meat: s.meat + 5
				}),
				available: () => true
			},
			{
				id: "pill",
				name: "알약 ×1",
				price: 80,
				apply: (s) => ({
					...s,
					pills: s.pills + 1
				}),
				available: () => true
			},
			{
				id: "rotten",
				name: "썩은 고기 ×2",
				price: 20,
				apply: (s) => ({
					...s,
					rotten: s.rotten + 2
				}),
				available: () => true
			},
			{
				id: "wire",
				name: `노멀 와이어 ×${WIRE_PACK.count}`,
				price: WIRE_PACK.price,
				apply: (s) => ({
					...s,
					wires: (s.wires ?? 0) + WIRE_PACK.count
				}),
				available: () => true
			},
			{
				id: "rope2",
				name: "성장기 로프",
				price: 1500,
				apply: (s) => ({
					...s,
					ropeLevel: 2
				}),
				available: (s) => s.ropeLevel < 2 && rank >= 2
			}
		];
		for (const c of CAGES) if (c.price > 0) items.push({
			id: `cage:${c.id}`,
			name: `케이지: ${c.id}`,
			price: c.price,
			apply: (s) => ({
				...s,
				cages: [...s.cages, c.id]
			}),
			available: (s) => !s.cages.includes(c.id) && rank >= c.minRank
		});
		return items.filter((i) => i.available(save));
	}
	function buy(save, item) {
		if (save.bits < item.price) return fail(save, "bit가 부족해요.");
		return {
			ok: true,
			message: `${item.name} 구입!`,
			save: {
				...item.apply(save),
				bits: save.bits - item.price
			}
		};
	}
	// src/core/battle.ts
	var ARENA = {
		w: 480,
		h: 250
	};
	var TIME_LIMIT = 90;
	var DT = .1;
	var entrantOf = (d, mode) => ({
		uid: d.uid,
		speciesId: d.speciesId,
		stats: d.stats,
		personality: d.personality,
		mode
	});
	function makeEnemies(stage, count, scale, rng) {
		const pool = speciesByStage(stage);
		return Array.from({ length: count }, () => {
			const sp = pick(rng, pool);
			return {
				speciesId: sp.id,
				stats: typicalStats(sp.id, scale * range(rng, .9, 1.1)),
				personality: pick(rng, PERSONALITIES),
				mode: pick(rng, [
					"일반",
					"일반",
					"특수",
					"지원"
				])
			};
		});
	}
	function createBattle(mine, foes) {
		const units = [];
		const place = (list, team) => list.forEach((e, i) => {
			const sp = getSpecies(e.speciesId);
			const maxHp = 40 + e.stats.hp * 3;
			const maxTp = 20 + e.stats.tp;
			units.push({
				id: units.length,
				team,
				uid: e.uid,
				name: sp.name,
				speciesId: sp.id,
				attr: sp.attr,
				stats: e.stats,
				personality: e.personality,
				mode: e.mode,
				x: team === 0 ? 70 : ARENA.w - 70,
				y: ARENA.h / (list.length + 1) * (i + 1),
				hp: maxHp,
				maxHp,
				tp: maxTp,
				maxTp,
				cd: .5 + i * .2,
				retreat: 0,
				wasHit: false,
				alive: true
			});
		});
		place(mine, 0);
		place(foes, 1);
		return {
			units,
			t: 0,
			over: false,
			winner: null,
			reason: null
		};
	}
	/** 백신 > 바이러스 > 데이터 > 백신 */
	function attrMult(a, b) {
		if (a === "백신" && b === "바이러스" || a === "바이러스" && b === "데이터" || a === "데이터" && b === "백신") return 1.2;
		if (a === b) return 1;
		return .9;
	}
	var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	function move(u, tx, ty, speed, away = false) {
		const dx = tx - u.x;
		const dy = ty - u.y;
		const len = Math.hypot(dx, dy) || 1;
		const k = speed * DT * (away ? -1 : 1) / len;
		u.x = Math.min(ARENA.w - 20, Math.max(20, u.x + dx * k));
		u.y = Math.min(ARENA.h - 20, Math.max(20, u.y + dy * k));
	}
	/** 전투를 0.1초 진행한다. state를 직접 바꾸고 이번 스텝의 이벤트를 돌려준다 */
	function stepBattle(s, rng) {
		const events = [];
		if (s.over) return events;
		s.t += DT;
		for (const u of s.units) {
			if (!u.alive) continue;
			u.cd -= DT;
			u.retreat -= DT;
			const foes = s.units.filter((o) => o.alive && o.team !== u.team);
			const allies = s.units.filter((o) => o.alive && o.team === u.team);
			if (!foes.length) break;
			const near = foes.reduce((a, b) => dist(u, a) <= dist(u, b) ? a : b);
			const speed = 40 + Math.min(80, u.stats.spd * .4);
			const d = dist(u, near);
			if (u.personality === "게으름" && !u.wasHit) continue;
			const fleeing = u.personality === "겁쟁이" && foes.length > allies.length || u.retreat > 0;
			if (u.mode === "지원") {
				const weak = allies.filter((a) => a.hp / a.maxHp < .7).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
				if (weak && u.tp >= 15 && u.cd <= 0) {
					const amount = Math.round(weak.maxHp * .12 + u.stats.int * .5);
					weak.hp = Math.min(weak.maxHp, weak.hp + amount);
					u.tp -= 15;
					u.cd = 2;
					events.push({
						type: "heal",
						from: u.id,
						to: weak.id,
						amount
					});
					continue;
				}
				if (d < 130) {
					move(u, near.x, near.y, speed, true);
					if (d > 45) continue;
				} else if (d > 190) {
					move(u, near.x, near.y, speed);
					continue;
				}
			} else if (fleeing && d > 45) {
				move(u, near.x, near.y, speed, true);
				continue;
			}
			const pSpecial = Math.min(.6, .1 + u.stats.int / 600) * (u.mode === "특수" ? 3 : u.mode === "일반" ? .4 : .3) * (u.personality === "쿨" ? 1.6 : u.personality === "솔직" ? 1.2 : 1);
			const wantsSpecial = u.cd <= 0 && u.tp >= 20 && d <= 150 && rng() < pSpecial;
			if (!wantsSpecial && d > 42) {
				if (u.mode !== "지원") move(u, near.x, near.y, speed);
				continue;
			}
			if (u.cd > 0) continue;
			const special = wantsSpecial;
			let dmg = (8 + (special ? (u.stats.atk + u.stats.int) / 2 : u.stats.atk) * .9) * (100 / (100 + near.stats.def)) * range(rng, .85, 1.15) * attrMult(u.attr, near.attr);
			if (special) dmg *= 2.2;
			if (u.personality === "열혈") dmg *= 1.2;
			if (u.personality === "제멋대로") dmg *= 1.1;
			if (u.mode === "지원") dmg *= .6;
			const damage = Math.max(1, Math.round(dmg));
			near.hp = Math.max(0, near.hp - damage);
			near.wasHit = true;
			if (special) u.tp -= 20;
			u.cd = (1.3 - Math.min(.6, u.stats.spd / 400)) * (u.personality === "제멋대로" ? .9 : 1);
			if (u.personality === "성급한") u.retreat = .8;
			events.push({
				type: "hit",
				from: u.id,
				to: near.id,
				damage,
				special
			});
			if (near.hp <= 0) {
				near.alive = false;
				events.push({
					type: "ko",
					id: near.id
				});
			}
		}
		const alive = [0, 1].map((t) => s.units.some((u) => u.alive && u.team === t));
		if (!alive[0] || !alive[1]) {
			s.over = true;
			s.winner = alive[0] ? 0 : 1;
			s.reason = "ko";
		} else if (s.t >= 90) {
			const ratio = (t) => s.units.filter((u) => u.team === t).reduce((a, u) => a + u.hp / u.maxHp, 0);
			s.over = true;
			s.winner = ratio(0) >= ratio(1) ? 0 : 1;
			s.reason = "timeout";
		}
		return events;
	}
	function runBattle(mine, foes, rng) {
		const s = createBattle(mine, foes);
		while (!s.over) stepBattle(s, rng);
		return s;
	}
	/** 배틀 결과를 디지몬에게 반영: 횟수·승수, 피로, 쓰러진 디지몬의 부상 */
	function applyBattleResult(d, won, ko, rng) {
		const injuryChance = ko ? d.personality === "대담" ? .6 : .3 : 0;
		return {
			...d,
			battles: d.battles + 1,
			wins: d.wins + (won ? 1 : 0),
			fatigue: Math.min(100, d.fatigue + 20),
			hunger: Math.max(0, d.hunger - 10),
			injured: d.injured || rng() < injuryChance
		};
	}
	// src/core/food.ts
	/** 바닥 먹이는 기존 저장 방식대로 재고 안에서 예약한다. 먹을 때만 재고를 차감한다. */
	function availableFood(save, foods, kind) {
		return Math.max(0, save[kind] - foods.filter((f) => f.kind === kind).length);
	}
	/** 이전 버전에서 중복 사용한 예약·잘못된 좌표만 정리하며 남은 먹이는 순서대로 보존한다. */
	function restoreFloorFood(save, raw) {
		const foods = [];
		if (!Array.isArray(raw)) return foods;
		for (const f of raw) {
			if (!f || f.kind !== "meat" && f.kind !== "rotten" || !Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
			if (availableFood(save, foods, f.kind) > 0) foods.push({
				kind: f.kind,
				x: Math.min(900, Math.max(60, f.x)),
				y: Math.min(520, Math.max(120, f.y))
			});
		}
		return foods;
	}
	/** 직접 급여도 바닥에 예약한 수량을 제외한다. 버튼과 끌어 주기가 같은 규칙을 쓴다. */
	function feedFromTray(save, foods, uid, kind) {
		if (availableFood(save, foods, kind) <= 0) return {
			ok: false,
			save,
			message: "사용 가능한 먹이가 없어요. 바닥에 놓인 먹이는 따로 예약되어 있어요."
		};
		return kind === "meat" ? feed(save, uid) : feedRotten(save, uid);
	}
	/** 실패한 급여는 바닥 먹이와 재고를 그대로 둔다. 성공할 때만 한 개를 함께 소비한다. */
	function eatFloorFood(save, foods, uid, index) {
		const food = foods[index];
		const result = food ? food.kind === "meat" ? feed(save, uid) : feedRotten(save, uid) : {
			ok: false,
			save,
			message: "먹이가 없어요."
		};
		return {
			...result,
			foods: result.ok ? foods.filter((_, i) => i !== index) : foods
		};
	}
	exports.ARENA = ARENA;
	exports.ATTRS = ATTRS;
	exports.CAGES = CAGES;
	exports.CAGE_SPACE_BY_RANK = CAGE_SPACE_BY_RANK;
	exports.CAPACITY = CAPACITY;
	exports.CAPACITY_BY_RANK = CAPACITY_BY_RANK;
	exports.CHAMP_DAY = CHAMP_DAY;
	exports.CHAMP_SEASON = CHAMP_SEASON;
	exports.DAYS_PER_SEASON = DAYS_PER_SEASON;
	exports.DAY_END_HOUR = DAY_END_HOUR;
	exports.DAY_START_HOUR = DAY_START_HOUR;
	exports.EGG_MINUTES = EGG_MINUTES;
	exports.FAMILIES = FAMILIES;
	exports.FIELDS = FIELDS;
	exports.FINAL = FINAL;
	exports.FINAL_ROUNDS = FINAL_ROUNDS;
	exports.HUNT_CLOSE_HOUR = HUNT_CLOSE_HOUR;
	exports.HUNT_OPEN_HOUR = HUNT_OPEN_HOUR;
	exports.LIFESPAN = LIFESPAN;
	exports.MIN_PER_DAY = MIN_PER_DAY;
	exports.OFFLINE_CAP_MINUTES = OFFLINE_CAP_MINUTES;
	exports.PERSONALITIES = PERSONALITIES;
	exports.PRELIM = PRELIM;
	exports.PRELIM_DAYS = PRELIM_DAYS;
	exports.PRELIM_MIN_RANK = PRELIM_MIN_RANK;
	exports.PRELIM_WINS = PRELIM_WINS;
	exports.ROOKIE_CHANCE = ROOKIE_CHANCE;
	exports.SEASONS = SEASONS;
	exports.SEASON_CODE = SEASON_CODE;
	exports.SPECIES = SPECIES;
	exports.STAGE_LABEL = STAGE_LABEL;
	exports.START_CAGES = START_CAGES;
	exports.START_CLOCK = START_CLOCK;
	exports.STAT_KEYS = STAT_KEYS;
	exports.STAT_LABEL = STAT_LABEL;
	exports.TIME_LIMIT = TIME_LIMIT;
	exports.TITLES = TITLES;
	exports.WILD_COUNT = WILD_COUNT;
	exports.WIRE_PACK = WIRE_PACK;
	exports.advance = advance;
	exports.advanceOffline = advanceOffline;
	exports.applyBattleResult = applyBattleResult;
	exports.applyMatch = applyMatch;
	exports.applyWin = applyWin;
	exports.availableFood = availableFood;
	exports.buy = buy;
	exports.cageSpaceOf = cageSpaceOf;
	exports.canHuntNow = canHuntNow;
	exports.capacityOf = capacityOf;
	exports.capture = capture;
	exports.clean = clean;
	exports.cleanOne = cleanOne;
	exports.createBattle = createBattle;
	exports.dateOf = dateOf;
	exports.defaultRng = defaultRng;
	exports.eatFloorFood = eatFloorFood;
	exports.endDay = endDay;
	exports.endOfLife = endOfLife;
	exports.entrantOf = entrantOf;
	exports.evolutionBonus = evolutionBonus;
	exports.explain = explain;
	exports.feed = feed;
	exports.feedFromTray = feedFromTray;
	exports.feedRotten = feedRotten;
	exports.findEvolution = findEvolution;
	exports.freshSave = freshSave;
	exports.getCage = getCage;
	exports.getSpecies = getSpecies;
	exports.heal = heal;
	exports.hints = hints;
	exports.huntFields = huntFields;
	exports.huntPool = huntPool;
	exports.isNight = isNight;
	exports.makeEnemies = makeEnemies;
	exports.maxStageForRank = maxStageForRank;
	exports.meets = meets;
	exports.newDigimon = newDigimon;
	exports.nextMorningClock = nextMorningClock;
	exports.parseCond = parseCond;
	exports.pick = pick;
	exports.pickWild = pickWild;
	exports.range = range;
	exports.rankName = rankName;
	exports.release = release;
	exports.reqScale = reqScale;
	exports.restoreFloorFood = restoreFloorFood;
	exports.ropeDamage = ropeDamage;
	exports.runBattle = runBattle;
	exports.seeded = seeded;
	exports.setCage = setCage;
	exports.shopItems = shopItems;
	exports.speciesByStage = speciesByStage;
	exports.stepBattle = stepBattle;
	exports.tamerRank = tamerRank;
	exports.tickFarm = tickFarm;
	exports.todaysMatches = todaysMatches;
	exports.typicalStats = typicalStats;
	exports.upcoming = upcoming;
	exports.usedCapacity = usedCapacity;
	exports.wildHp = wildHp;
	return exports;
})({});
