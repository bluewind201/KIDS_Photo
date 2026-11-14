export interface GeoRegionEntry {
  name: string;
  province: string;
  lat: number;
  lng: number;
  radiusKm: number;
  aliases: string[];
}

/**
 * Offline high-speed reverse geocoder for Korean cities, districts, parks, beaches,
 * ski resorts, and popular overseas family travel destinations.
 * Converts raw EXIF / cloud GPS coordinates into human-friendly Korean place names in <0.1ms!
 */
export const KOREA_AND_TRIP_REGIONS: GeoRegionEntry[] = [
  // 제주권 (세부 권역 우선)
  { name: '제주 협재·한림', province: '제주도', lat: 33.3943, lng: 126.2397, radiusKm: 10, aliases: ['제주', '제주도', '제주시', '협재', '한림', '금능', '바다'] },
  { name: '제주 애월', province: '제주도', lat: 33.4628, lng: 126.3114, radiusKm: 9, aliases: ['제주', '제주도', '제주시', '애월', '곽지', '바다'] },
  { name: '제주 성산·우도', province: '제주도', lat: 33.4581, lng: 126.9426, radiusKm: 13, aliases: ['제주', '제주도', '서귀포', '성산', '성산일출봉', '섭지코지', '우도', '바다'] },
  { name: '제주 중문', province: '제주도', lat: 33.2494, lng: 126.4123, radiusKm: 10, aliases: ['제주', '제주도', '서귀포', '중문', '색달', '바다'] },
  { name: '제주 함덕·조천', province: '제주도', lat: 33.5434, lng: 126.6692, radiusKm: 10, aliases: ['제주', '제주도', '제주시', '함덕', '조천', '월정리', '바다'] },
  { name: '제주 서귀포시', province: '제주도', lat: 33.2541, lng: 126.5601, radiusKm: 24, aliases: ['제주', '제주도', '서귀포', '서귀포시'] },
  { name: '제주 제주시', province: '제주도', lat: 33.4996, lng: 126.5312, radiusKm: 28, aliases: ['제주', '제주도', '제주시'] },

  // 서울 주요 명소·구 단위
  { name: '서울 성수·서울숲', province: '서울', lat: 37.5444, lng: 127.0374, radiusKm: 3.5, aliases: ['서울', '성수', '성수동', '서울숲', '성동구', '공원'] },
  { name: '서울 잠실·롯데월드', province: '서울', lat: 37.5125, lng: 127.1002, radiusKm: 4.5, aliases: ['서울', '잠실', '롯데월드', '석촌호수', '올림픽공원', '송파구'] },
  { name: '서울 여의도·한강공원', province: '서울', lat: 37.5264, lng: 126.9282, radiusKm: 4, aliases: ['서울', '여의도', '한강', '한강공원', '영등포구'] },
  { name: '서울 강남·코엑스', province: '서울', lat: 37.5065, lng: 127.0432, radiusKm: 5.5, aliases: ['서울', '강남', '강남구', '삼성동', '코엑스', '신사', '서초'] },
  { name: '서울 광화문·경복궁', province: '서울', lat: 37.5759, lng: 126.9769, radiusKm: 4, aliases: ['서울', '종로', '광화문', '경복궁', '북촌', '인사동', '청계천'] },
  { name: '서울 남산·명동', province: '서울', lat: 37.5512, lng: 126.9882, radiusKm: 3.5, aliases: ['서울', '남산', '남산타워', '명동', '용산', '중구'] },
  { name: '서울 어린이대공원·광진', province: '서울', lat: 37.5479, lng: 127.0746, radiusKm: 3.8, aliases: ['서울', '어린이대공원', '광진구', '건대', '뚝섬'] },
  { name: '서울 상암·망원·홍대', province: '서울', lat: 37.5662, lng: 126.9019, radiusKm: 5.5, aliases: ['서울', '마포', '상암', '하늘공원', '월드컵공원', '망원', '홍대', '연남'] },
  { name: '서울 마곡·서울식물원', province: '서울', lat: 37.5692, lng: 126.8351, radiusKm: 5, aliases: ['서울', '강서구', '마곡', '서울식물원', '식물원'] },
  { name: '서울 북서울꿈의숲·노원', province: '서울', lat: 37.6205, lng: 127.0412, radiusKm: 7, aliases: ['서울', '강북', '노원', '도봉', '북서울꿈의숲'] },
  { name: '서울특별시', province: '서울', lat: 37.5665, lng: 126.978, radiusKm: 16, aliases: ['서울', '서울시', '서울특별시'] },

  // 경기·인천 나들이 & 도시
  { name: '용인 에버랜드', province: '경기도', lat: 37.2939, lng: 127.2025, radiusKm: 5.5, aliases: ['경기', '경기도', '용인', '에버랜드', '캐리비안베이', '놀이공원'] },
  { name: '과천 서울대공원·과학관', province: '경기도', lat: 37.4288, lng: 127.0168, radiusKm: 4.5, aliases: ['경기', '경기도', '과천', '서울대공원', '서울랜드', '동물원', '과천과학관'] },
  { name: '성남 분당·판교', province: '경기도', lat: 37.3827, lng: 127.1189, radiusKm: 9, aliases: ['경기', '경기도', '성남', '분당', '판교', '율동공원'] },
  { name: '수원 광교·화성행궁', province: '경기도', lat: 37.2804, lng: 127.0306, radiusKm: 10, aliases: ['경기', '경기도', '수원', '광교', '광교호수공원', '수원화성'] },
  { name: '화성 동탄·제부도', province: '경기도', lat: 37.2006, lng: 127.095, radiusKm: 13, aliases: ['경기', '경기도', '화성', '동탄'] },
  { name: '고양 일산호수공원', province: '경기도', lat: 37.6584, lng: 126.77, radiusKm: 11, aliases: ['경기', '경기도', '고양', '일산', '일산호수공원', '킨텍스'] },
  { name: '파주 헤이리·임진각', province: '경기도', lat: 37.7897, lng: 126.6985, radiusKm: 15, aliases: ['경기', '경기도', '파주', '헤이리', '마장호수'] },
  { name: '가평 자라섬·아침고요수목원', province: '경기도', lat: 37.8145, lng: 127.4852, radiusKm: 20, aliases: ['경기', '경기도', '가평', '청평', '자라섬', '남이섬', '캠핑'] },
  { name: '양평 두물머리', province: '경기도', lat: 37.5303, lng: 127.3175, radiusKm: 16, aliases: ['경기', '경기도', '양평', '두물머리', '세미원'] },
  { name: '하남 미사·스타필드', province: '경기도', lat: 37.5455, lng: 127.2236, radiusKm: 7, aliases: ['경기', '경기도', '하남', '미사', '스타필드'] },
  { name: '인천 송도센트럴파크', province: '인천', lat: 37.3925, lng: 126.639, radiusKm: 8, aliases: ['인천', '송도', '송도센트럴파크'] },
  { name: '인천 영종도·을왕리', province: '인천', lat: 37.4547, lng: 126.4046, radiusKm: 14, aliases: ['인천', '영종도', '을왕리', '인천공항', '바다'] },
  { name: '인천 강화도', province: '인천', lat: 37.7465, lng: 126.4878, radiusKm: 18, aliases: ['인천', '강화', '강화도', '동막해변'] },
  { name: '인천광역시', province: '인천', lat: 37.4563, lng: 126.7052, radiusKm: 16, aliases: ['인천', '인천시', '부평', '월미도'] },

  // 강원권 (바다·산·스키)
  { name: '춘천 의암호·레고랜드', province: '강원도', lat: 37.8813, lng: 127.7298, radiusKm: 18, aliases: ['강원', '강원도', '춘천', '레고랜드', '소양강'] },
  { name: '홍천 비발디파크', province: '강원도', lat: 37.6458, lng: 127.6845, radiusKm: 18, aliases: ['강원', '강원도', '홍천', '비발디파크', '오션월드'] },
  { name: '속초 해변·설악산', province: '강원도', lat: 38.207, lng: 128.5918, radiusKm: 15, aliases: ['강원', '강원도', '속초', '설악산', '속초해수욕장', '바다'] },
  { name: '양양 낙산·서피비치', province: '강원도', lat: 38.0754, lng: 128.6189, radiusKm: 15, aliases: ['강원', '강원도', '양양', '낙산', '하조대', '바다'] },
  { name: '강릉 경포·안목해변', province: '강원도', lat: 37.7955, lng: 128.9085, radiusKm: 18, aliases: ['강원', '강원도', '강릉', '경포', '경포대', '안목', '주문진', '정동진', '바다'] },
  { name: '평창 대관령·용평', province: '강원도', lat: 37.6547, lng: 128.6708, radiusKm: 20, aliases: ['강원', '강원도', '평창', '대관령', '양떼목장', '알펜시아', '용평', '휘닉스파크'] },
  { name: '동해·삼척 추암해변', province: '강원도', lat: 37.4792, lng: 129.1592, radiusKm: 20, aliases: ['강원', '강원도', '동해', '삼척', '망상', '장호항', '바다'] },
  { name: '원주시', province: '강원도', lat: 37.3422, lng: 127.9202, radiusKm: 18, aliases: ['강원', '강원도', '원주', '뮤지엄산', '오크밸리'] },

  // 충청·대전·세종
  { name: '대전광역시', province: '대전', lat: 36.3504, lng: 127.3845, radiusKm: 16, aliases: ['대전', '대전시', '유성', '오월드', '한밭수목원', '성심당'] },
  { name: '세종특별자치시', province: '세종', lat: 36.48, lng: 127.289, radiusKm: 14, aliases: ['세종', '세종시', '세종호수공원', '국립세종수목원'] },
  { name: '청주시', province: '충청북도', lat: 36.6424, lng: 127.489, radiusKm: 16, aliases: ['충북', '충청북도', '청주', '청주시'] },
  { name: '천안·아산', province: '충청남도', lat: 36.8151, lng: 127.1139, radiusKm: 18, aliases: ['충남', '충청남도', '천안', '아산', '독립기념관'] },
  { name: '태안 안면도·꽃지해변', province: '충청남도', lat: 36.5015, lng: 126.3352, radiusKm: 22, aliases: ['충남', '충청남도', '태안', '안면도', '만리포', '꽃지', '바다'] },
  { name: '보령 대천해수욕장', province: '충청남도', lat: 36.3056, lng: 126.5161, radiusKm: 16, aliases: ['충남', '충청남도', '보령', '대천', '바다'] },
  { name: '단양·제천', province: '충청북도', lat: 36.9845, lng: 128.3655, radiusKm: 22, aliases: ['충북', '충청북도', '단양', '제천', '청풍호'] },

  // 부산·경상권
  { name: '부산 해운대·광안리', province: '부산', lat: 35.1587, lng: 129.1604, radiusKm: 9, aliases: ['부산', '부산시', '해운대', '광안리', '센텀', '송정', '동백섬', '바다'] },
  { name: '부산 기장·오시리아', province: '부산', lat: 35.1945, lng: 129.2228, radiusKm: 9, aliases: ['부산', '부산시', '기장', '롯데월드부산', '해동용궁사', '바다'] },
  { name: '부산광역시', province: '부산', lat: 35.1796, lng: 129.0756, radiusKm: 18, aliases: ['부산', '부산시', '남포동', '송도', '영도', '태종대', '다대포'] },
  { name: '경주 황리단길·보문단지', province: '경상북도', lat: 35.8398, lng: 129.2268, radiusKm: 20, aliases: ['경북', '경상북도', '경주', '황리단길', '첨성대', '불국사', '경주월드', '보문호'] },
  { name: '대구광역시', province: '대구', lat: 35.8714, lng: 128.6014, radiusKm: 18, aliases: ['대구', '대구시', '수성못', '이월드', '팔공산'] },
  { name: '울산광역시', province: '울산', lat: 35.5384, lng: 129.3114, radiusKm: 18, aliases: ['울산', '울산시', '간절곶', '일산해수욕장', '태화강'] },
  { name: '포항 호미곶·영일대', province: '경상북도', lat: 36.0562, lng: 129.3782, radiusKm: 20, aliases: ['경북', '경상북도', '포항', '영일대', '호미곶', '구룡포', '바다'] },
  { name: '거제·통영', province: '경상남도', lat: 34.8505, lng: 128.5322, radiusKm: 25, aliases: ['경남', '경상남도', '거제', '거제도', '통영', '외도', '바람의언덕', '바다'] },
  { name: '남해 독일마을', province: '경상남도', lat: 34.8005, lng: 127.9912, radiusKm: 20, aliases: ['경남', '경상남도', '남해', '상주은모래비치', '바다'] },
  { name: '창원·김해', province: '경상남도', lat: 35.2279, lng: 128.6818, radiusKm: 20, aliases: ['경남', '경상남도', '창원', '진해', '마산', '김해'] },

  // 전라·광주권
  { name: '전주 한옥마을', province: '전라북도', lat: 35.8147, lng: 127.1526, radiusKm: 16, aliases: ['전북', '전라북도', '전주', '전주한옥마을'] },
  { name: '여수 해양공원·오동도', province: '전라남도', lat: 34.7426, lng: 127.7376, radiusKm: 18, aliases: ['전남', '전라남도', '여수', '오동도', '돌산', '아쿠아플라넷', '바다'] },
  { name: '순천만 국가정원', province: '전라남도', lat: 34.9288, lng: 127.5015, radiusKm: 16, aliases: ['전남', '전라남도', '순천', '순천만', '순천만국가정원'] },
  { name: '광주광역시', province: '광주', lat: 35.1595, lng: 126.8526, radiusKm: 18, aliases: ['광주', '광주시', '무등산', '패밀리랜드'] },
  { name: '군산 선유도·시간여행마을', province: '전라북도', lat: 35.9677, lng: 126.7366, radiusKm: 20, aliases: ['전북', '전라북도', '군산', '선유도'] },
  { name: '담양 죽녹원·메타세쿼이아길', province: '전라남도', lat: 35.3212, lng: 126.9854, radiusKm: 15, aliases: ['전남', '전라남도', '담양', '죽녹원'] },

  // 한국 가족 해외여행 대표 휴양지·도시
  { name: '일본 오사카·유니버설', province: '일본', lat: 34.6937, lng: 135.5023, radiusKm: 35, aliases: ['일본', '오사카', '교토', '유니버설', '해외여행'] },
  { name: '일본 도쿄·디즈니', province: '일본', lat: 35.6762, lng: 139.6503, radiusKm: 40, aliases: ['일본', '도쿄', '디즈니랜드', '해외여행'] },
  { name: '일본 후쿠오카', province: '일본', lat: 33.5902, lng: 130.4017, radiusKm: 35, aliases: ['일본', '후쿠오카', '유후인', '해외여행'] },
  { name: '일본 오키나와', province: '일본', lat: 26.3344, lng: 127.8056, radiusKm: 55, aliases: ['일본', '오키나와', '츄라우미', '바다', '해외여행'] },
  { name: '베트남 다낭·호이안', province: '베트남', lat: 16.0544, lng: 108.2022, radiusKm: 40, aliases: ['베트남', '다낭', '호이안', '바다', '해외여행'] },
  { name: '베트남 나트랑', province: '베트남', lat: 12.2388, lng: 109.1967, radiusKm: 35, aliases: ['베트남', '나트랑', '냐짱', '바다', '해외여행'] },
  { name: '베트남 푸꾸옥', province: '베트남', lat: 10.2899, lng: 103.984, radiusKm: 40, aliases: ['베트남', '푸꾸옥', '바다', '해외여행'] },
  { name: '괌 투몬비치', province: '괌', lat: 13.5094, lng: 144.8051, radiusKm: 35, aliases: ['괌', '투몬', '바다', '해외여행'] },
  { name: '사이판', province: '사이판', lat: 15.185, lng: 145.7467, radiusKm: 30, aliases: ['사이판', '마나가하', '바다', '해외여행'] },
  { name: '태국 방콕·파타야', province: '태국', lat: 13.7563, lng: 100.5018, radiusKm: 55, aliases: ['태국', '방콕', '파타야', '해외여행'] },
  { name: '싱가포르 센토사', province: '싱가포르', lat: 1.3521, lng: 103.8198, radiusKm: 30, aliases: ['싱가포르', '센토사', '해외여행'] },
  { name: '하와이 호놀룰루', province: '미국 하와이', lat: 21.3069, lng: -157.8583, radiusKm: 45, aliases: ['하와이', '호놀룰루', '와이키키', '바다', '해외여행'] },
];

/**
 * Regional location hierarchy groups so asking "제주도 사진", "강원도 사진", "부산 사진", "우리집 사진"
 * matches ALL sub-cities, beaches, and districts in that region!
 */
export const LOCATION_HIERARCHY_GROUPS: string[][] = [
  ['제주', '제주도', '제주시', '서귀포', '서귀포시', '협재', '애월', '성산', '성산일출봉', '우도', '중문', '함덕', '월정리', '한림', '한라산'],
  ['강원', '강원도', '강릉', '속초', '양양', '평창', '대관령', '춘천', '홍천', '동해', '삼척', '원주', '정선', '인제', '고성', '경포', '설악산', '주문진', '안목'],
  ['부산', '부산시', '부산광역시', '해운대', '광안리', '기장', '송정', '센텀', '남포동', '영도', '태종대', '다대포'],
  ['서울', '서울시', '서울특별시', '서울숲', '성수', '성수동', '잠실', '롯데월드', '석촌호수', '여의도', '한강', '한강공원', '강남', '코엑스', '경복궁', '광화문', '남산', '어린이대공원', '홍대', '마곡', '서울식물원'],
  ['경기', '경기도', '가평', '양평', '용인', '에버랜드', '과천', '서울대공원', '수원', '광교', '성남', '분당', '판교', '고양', '일산', '파주', '화성', '동탄', '하남', '남이섬', '자라섬'],
  ['인천', '인천시', '인천광역시', '송도', '영종도', '을왕리', '강화', '강화도', '월미도'],
  ['경주', '황리단길', '첨성대', '불국사', '보문단지', '경주월드'],
  ['여수', '순천', '순천만', '오동도', '전남', '전라남도', '담양'],
  ['전주', '전주한옥마을', '군산', '전북', '전라북도'],
  ['대전', '대전시', '세종', '세종시', '청주', '천안', '아산', '태안', '안면도', '대천', '보령', '단양', '제천', '충남', '충북'],
  ['대구', '대구시', '울산', '울산시', '포항', '거제', '거제도', '통영', '남해', '창원'],
  ['집', '우리집', '거실', '안방', '아이방', '놀이방', '실내', '실내추억', '홈'],
  ['유치원', '어린이집', '학교', '교실', '운동장', '발표회', '졸업식', '입학식'],
  ['식당', '카페', '베이커리', '레스토랑', '브런치', '맛집'],
  ['일본', '오사카', '도쿄', '후쿠오카', '오키나와', '베트남', '다낭', '나트랑', '푸꾸옥', '괌', '사이판', '싱가포르', '하와이', '해외', '해외여행'],
];

function calcDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface ReverseGeocodedKoreaLocation {
  locationName: string;
  locationLabel: string;
  displayLocation: string;
  locationTags: string[];
  tags: string[];
  searchTokens: string[];
}

function makeGeoResult(
  locationName: string,
  rawTags: string[]
): ReverseGeocodedKoreaLocation {
  const cleanTags = Array.from(new Set(rawTags.filter(Boolean)));
  return {
    locationName,
    locationLabel: locationName,
    displayLocation: locationName,
    locationTags: cleanTags,
    tags: cleanTags,
    searchTokens: cleanTags,
  };
}

export function reverseGeocodeKoreaLatLng(
  lat?: number | null,
  lng?: number | null
): ReverseGeocodedKoreaLocation | null {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }

  let bestInside: { entry: GeoRegionEntry; dist: number; ratio: number } | null = null;
  let nearestOverall: { entry: GeoRegionEntry; dist: number } | null = null;

  for (const entry of KOREA_AND_TRIP_REGIONS) {
    const dist = calcDistanceKm(lat, lng, entry.lat, entry.lng);
    if (!nearestOverall || dist < nearestOverall.dist) {
      nearestOverall = { entry, dist };
    }
    if (dist <= entry.radiusKm) {
      // Prefer more specific (smaller radius) sub-regions when inside multiple circles!
      const specificityScore = dist + entry.radiusKm * 0.35;
      if (!bestInside || specificityScore < bestInside.ratio) {
        bestInside = { entry, dist, ratio: specificityScore };
      }
    }
  }

  if (bestInside) {
    return makeGeoResult(bestInside.entry.name, [
      bestInside.entry.province,
      ...bestInside.entry.aliases,
    ]);
  }

  if (nearestOverall && nearestOverall.dist <= 38) {
    const label = nearestOverall.entry.province
      ? `${nearestOverall.entry.province} ${nearestOverall.entry.name.replace(/^[^\s]+\s+/, '')}`
      : nearestOverall.entry.name;
    return makeGeoResult(label, [
      nearestOverall.entry.province,
      ...nearestOverall.entry.aliases,
    ]);
  }

  // Broad Korean province bounding boxes fallback
  if (lat >= 33.1 && lat <= 33.65 && lng >= 126.1 && lng <= 127.05) {
    return makeGeoResult('제주특별자치도', ['제주', '제주도']);
  }
  if (lat >= 37.0 && lat <= 38.6 && lng >= 127.55 && lng <= 129.4) {
    return makeGeoResult('강원도 여행지', ['강원', '강원도']);
  }
  if (lat >= 36.9 && lat <= 38.2 && lng >= 126.5 && lng <= 127.7) {
    return makeGeoResult('수도권 나들이', ['경기', '경기도', '서울']);
  }

  return null;
}

/**
 * Normalizes Korean administrative suffixes ("제주도" -> "제주", "부산광역시" -> "부산", "해운대구" -> "해운대")
 * so voice/text location queries match regardless of how the user phrases the region!
 */
export function stripKoreanAdminSuffix(token: string): string {
  const t = token.trim();
  if (t.length <= 2) return t;
  const stripped = t
    .replace(/(특별자치도|특별자치시|특별시|광역시)$/, '')
    .replace(/(해수욕장|호수공원|국립공원|놀이공원)$/, '')
    .trim();
  if (stripped.length >= 2) {
    const shortAdmin = stripped.replace(/(도|시|군|구|읍|면|동)$/, '').trim();
    if (shortAdmin.length >= 2) return shortAdmin;
    return stripped;
  }
  return t;
}
