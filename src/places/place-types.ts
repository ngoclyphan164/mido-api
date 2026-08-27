/**
 * Google Places (New) trả place type dạng key snake_case (`coffee_shop`,
 * `shopping_mall`, `point_of_interest`). Client render thẳng key này thành tag
 * nên phải dịch ở backend — để một chỗ duy nhất, tránh mỗi client tự chế bảng
 * dịch riêng rồi lệch nhau.
 *
 * Danh sách type gốc: https://developers.google.com/maps/documentation/places/web-service/place-types
 */

/**
 * Type không mang thông tin gì cho người đọc, hoặc chỉ là nhãn hành chính của
 * Geocoding. Bỏ hẳn thay vì dịch, vì tag "Điểm ưa thích" chỉ tốn chỗ.
 */
const GENERIC_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'food',
  'premise',
  'subpremise',
  'geocode',
  'route',
  'intersection',
  'street_address',
  'street_number',
  'plus_code',
  'postal_code',
  'postal_code_prefix',
  'postal_code_suffix',
  'postal_town',
  'political',
  'country',
  'locality',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'sublocality_level_3',
  'sublocality_level_4',
  'sublocality_level_5',
  'neighborhood',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'administrative_area_level_6',
  'administrative_area_level_7',
  'natural_feature',
  'floor',
  'room',
  'landmark',
  'general_contractor',
]);

const PLACE_TYPE_LABELS: Record<string, string> = {
  // Ăn uống
  restaurant: 'Nhà hàng',
  diner: 'Quán ăn',
  cafeteria: 'Căng tin',
  food_court: 'Khu ẩm thực',
  meal_takeaway: 'Mang đi',
  meal_delivery: 'Giao tận nơi',
  fast_food_restaurant: 'Đồ ăn nhanh',
  fine_dining_restaurant: 'Fine dining',
  breakfast_restaurant: 'Ăn sáng',
  brunch_restaurant: 'Brunch',
  buffet_restaurant: 'Buffet',
  barbecue_restaurant: 'Đồ nướng',
  seafood_restaurant: 'Hải sản',
  steak_house: 'Bít tết',
  hamburger_restaurant: 'Burger',
  pizza_restaurant: 'Pizza',
  sandwich_shop: 'Bánh mì kẹp',
  sushi_restaurant: 'Sushi',
  ramen_restaurant: 'Ramen',
  vegan_restaurant: 'Món thuần chay',
  vegetarian_restaurant: 'Món chay',
  deli: 'Đồ nguội',

  // Ẩm thực theo vùng
  vietnamese_restaurant: 'Món Việt',
  asian_restaurant: 'Món Á',
  chinese_restaurant: 'Món Trung',
  japanese_restaurant: 'Món Nhật',
  korean_restaurant: 'Món Hàn',
  thai_restaurant: 'Món Thái',
  indonesian_restaurant: 'Món Indonesia',
  indian_restaurant: 'Món Ấn',
  italian_restaurant: 'Món Ý',
  french_restaurant: 'Món Pháp',
  spanish_restaurant: 'Món Tây Ban Nha',
  greek_restaurant: 'Món Hy Lạp',
  turkish_restaurant: 'Món Thổ Nhĩ Kỳ',
  lebanese_restaurant: 'Món Li Băng',
  middle_eastern_restaurant: 'Món Trung Đông',
  mediterranean_restaurant: 'Món Địa Trung Hải',
  mexican_restaurant: 'Món Mexico',
  brazilian_restaurant: 'Món Brazil',
  american_restaurant: 'Món Mỹ',

  // Cà phê, trà, bánh
  cafe: 'Quán cà phê',
  coffee_shop: 'Quán cà phê',
  cat_cafe: 'Cafe mèo',
  dog_cafe: 'Cafe chó',
  internet_cafe: 'Tiệm net',
  tea_house: 'Quán trà',
  bubble_tea_store: 'Trà sữa',
  juice_shop: 'Nước ép',
  bakery: 'Tiệm bánh',
  dessert_shop: 'Tráng miệng',
  dessert_restaurant: 'Tráng miệng',
  ice_cream_shop: 'Kem',
  donut_shop: 'Bánh donut',
  bagel_shop: 'Bánh bagel',
  candy_store: 'Kẹo',
  chocolate_shop: 'Sô cô la',
  confectionery: 'Bánh kẹo',

  // Nhậu, bar
  bar: 'Quán bar',
  pub: 'Quán pub',
  bar_and_grill: 'Bar & nướng',
  wine_bar: 'Quán rượu vang',
  night_club: 'Club',
  liquor_store: 'Cửa hàng rượu',

  // Giải trí
  movie_theater: 'Rạp phim',
  karaoke: 'Karaoke',
  bowling_alley: 'Bowling',
  amusement_park: 'Công viên giải trí',
  amusement_center: 'Khu vui chơi',
  video_arcade: 'Khu game',
  casino: 'Sòng bạc',
  comedy_club: 'Câu lạc bộ hài',
  concert_hall: 'Phòng hòa nhạc',
  opera_house: 'Nhà hát opera',
  philharmonic_hall: 'Nhà hát giao hưởng',
  performing_arts_theater: 'Nhà hát',
  dance_hall: 'Sàn nhảy',
  event_venue: 'Địa điểm sự kiện',
  banquet_hall: 'Nhà hàng tiệc',
  wedding_venue: 'Địa điểm cưới',
  community_center: 'Nhà văn hóa',
  cultural_center: 'Trung tâm văn hóa',

  // Tham quan, ngoài trời
  tourist_attraction: 'Điểm tham quan',
  historical_landmark: 'Di tích lịch sử',
  historical_place: 'Địa điểm lịch sử',
  observation_deck: 'Đài quan sát',
  visitor_center: 'Trung tâm du khách',
  tourist_information_center: 'Thông tin du lịch',
  museum: 'Bảo tàng',
  art_gallery: 'Phòng tranh',
  planetarium: 'Nhà chiếu hình vũ trụ',
  aquarium: 'Thủy cung',
  zoo: 'Sở thú',
  wildlife_park: 'Vườn thú hoang dã',
  park: 'Công viên',
  national_park: 'Vườn quốc gia',
  state_park: 'Công viên bang',
  garden: 'Khu vườn',
  botanical_garden: 'Vườn bách thảo',
  plaza: 'Quảng trường',
  water_park: 'Công viên nước',
  hiking_area: 'Khu đi bộ đường dài',
  marina: 'Bến du thuyền',
  beach: 'Bãi biển',

  // Thể thao
  gym: 'Phòng gym',
  fitness_center: 'Trung tâm thể hình',
  yoga_studio: 'Yoga',
  swimming_pool: 'Hồ bơi',
  sports_complex: 'Khu thể thao',
  sports_club: 'Câu lạc bộ thể thao',
  sports_activity_location: 'Địa điểm thể thao',
  stadium: 'Sân vận động',
  arena: 'Nhà thi đấu',
  golf_course: 'Sân golf',
  athletic_field: 'Sân thể thao',
  ice_skating_rink: 'Sân trượt băng',
  skateboard_park: 'Sân trượt ván',
  playground: 'Khu vui chơi trẻ em',

  // Mua sắm
  shopping_mall: 'Trung tâm thương mại',
  department_store: 'Cửa hàng bách hóa',
  supermarket: 'Siêu thị',
  grocery_store: 'Cửa hàng thực phẩm',
  asian_grocery_store: 'Thực phẩm châu Á',
  convenience_store: 'Cửa hàng tiện lợi',
  market: 'Chợ',
  store: 'Cửa hàng',
  clothing_store: 'Thời trang',
  shoe_store: 'Giày dép',
  jewelry_store: 'Trang sức',
  book_store: 'Nhà sách',
  electronics_store: 'Điện máy',
  cell_phone_store: 'Điện thoại',
  furniture_store: 'Nội thất',
  home_goods_store: 'Đồ gia dụng',
  home_improvement_store: 'Vật liệu xây dựng',
  hardware_store: 'Kim khí',
  sporting_goods_store: 'Đồ thể thao',
  pet_store: 'Thú cưng',
  gift_shop: 'Quà lưu niệm',
  florist: 'Tiệm hoa',
  discount_store: 'Cửa hàng giá rẻ',
  warehouse_store: 'Cửa hàng kho',
  wholesaler: 'Bán sỉ',

  // Lưu trú
  hotel: 'Khách sạn',
  resort_hotel: 'Resort',
  extended_stay_hotel: 'Khách sạn dài hạn',
  motel: 'Nhà nghỉ',
  hostel: 'Hostel',
  inn: 'Nhà trọ',
  guest_house: 'Nhà khách',
  private_guest_room: 'Phòng cho thuê',
  bed_and_breakfast: 'B&B',
  farmstay: 'Farmstay',
  cottage: 'Nhà nghỉ dưỡng',
  campground: 'Khu cắm trại',
  camping_cabin: 'Nhà gỗ cắm trại',
  lodging: 'Chỗ lưu trú',
  apartment_complex: 'Chung cư',

  // Dịch vụ hay xuất hiện khi search theo tên
  bank: 'Ngân hàng',
  atm: 'ATM',
  post_office: 'Bưu điện',
  pharmacy: 'Nhà thuốc',
  drugstore: 'Nhà thuốc',
  hospital: 'Bệnh viện',
  doctor: 'Phòng khám',
  dentist: 'Nha khoa',
  veterinary_care: 'Thú y',
  spa: 'Spa',
  massage: 'Massage',
  sauna: 'Sauna',
  beauty_salon: 'Thẩm mỹ viện',
  hair_salon: 'Tiệm tóc',
  hair_care: 'Chăm sóc tóc',
  barber_shop: 'Tiệm cắt tóc',
  nail_salon: 'Tiệm nail',
  laundry: 'Giặt ủi',
  car_repair: 'Sửa xe',
  car_wash: 'Rửa xe',
  car_rental: 'Thuê xe',
  car_dealer: 'Đại lý ô tô',
  gas_station: 'Cây xăng',
  electric_vehicle_charging_station: 'Trạm sạc xe điện',
  parking: 'Bãi đỗ xe',
  library: 'Thư viện',
  preschool: 'Mầm non',
  primary_school: 'Trường tiểu học',
  secondary_school: 'Trường phổ thông',
  school: 'Trường học',
  university: 'Đại học',
  church: 'Nhà thờ',
  mosque: 'Nhà thờ Hồi giáo',
  hindu_temple: 'Đền Hindu',
  synagogue: 'Giáo đường Do Thái',
  place_of_worship: 'Nơi thờ tự',
  city_hall: 'Tòa thị chính',
  courthouse: 'Tòa án',
  embassy: 'Đại sứ quán',
  police: 'Công an',
  fire_station: 'Trạm cứu hỏa',
  local_government_office: 'Cơ quan nhà nước',
  corporate_office: 'Văn phòng công ty',
  travel_agency: 'Công ty du lịch',
  real_estate_agency: 'Bất động sản',
  insurance_agency: 'Bảo hiểm',
  telecommunications_service_provider: 'Nhà mạng',
  moving_company: 'Chuyển nhà',
  storage: 'Kho lưu trữ',
  funeral_home: 'Nhà tang lễ',
  cemetery: 'Nghĩa trang',
  lawyer: 'Luật sư',
  accounting: 'Kế toán',
  consultant: 'Tư vấn',

  // Giao thông
  airport: 'Sân bay',
  international_airport: 'Sân bay quốc tế',
  heliport: 'Sân bay trực thăng',
  bus_station: 'Bến xe buýt',
  bus_stop: 'Trạm xe buýt',
  train_station: 'Ga tàu',
  subway_station: 'Ga tàu điện ngầm',
  light_rail_station: 'Ga tàu điện',
  transit_station: 'Trạm trung chuyển',
  transit_depot: 'Bến trung chuyển',
  taxi_stand: 'Điểm đón taxi',
  ferry_terminal: 'Bến phà',
  rest_stop: 'Trạm dừng chân',
  truck_stop: 'Trạm dừng xe tải',
  park_and_ride: 'Bãi gửi xe đi chung',
};

/**
 * Type lạ (Google thêm mới liên tục) được viết hoa lại cho dễ đọc thay vì bỏ đi
 * — mất tag còn tệ hơn một tag tiếng Anh, và chắc chắn không lòi snake_case ra UI.
 */
function humanize(type: string): string {
  const words = type.replace(/_/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function placeTypeLabel(type: string): string | undefined {
  const normalized = type.trim().toLowerCase();
  if (!normalized || GENERIC_TYPES.has(normalized)) return undefined;

  const label = PLACE_TYPE_LABELS[normalized] ?? humanize(normalized);
  return label || undefined;
}

/**
 * Danh sách tag để render, `primaryType` luôn đứng đầu. Trùng label thì bỏ
 * (`cafe` và `coffee_shop` cùng ra "Quán cà phê").
 */
export function placeTypeLabels(types: readonly string[], primaryType?: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const type of primaryType ? [primaryType, ...types] : types) {
    const label = placeTypeLabel(type);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels;
}
