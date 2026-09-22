/**
 * Google Places (New) trả place type dạng key snake_case (`coffee_shop`,
 * `shopping_mall`, `point_of_interest`). Client render thẳng key này thành tag
 * nên backend phải đổi sang nhãn đọc được — để một chỗ duy nhất, tránh mỗi
 * client tự chế bảng nhãn riêng rồi lệch nhau. Nhãn viết bằng tiếng Anh.
 *
 * Danh sách type gốc: https://developers.google.com/maps/documentation/places/web-service/place-types
 */

/**
 * Type không mang thông tin gì cho người đọc, hoặc chỉ là nhãn hành chính của
 * Geocoding. Bỏ hẳn thay vì gán nhãn, vì tag "Point of interest" chỉ tốn chỗ.
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
  restaurant: 'Restaurant',
  diner: 'Diner',
  cafeteria: 'Cafeteria',
  food_court: 'Food court',
  meal_takeaway: 'Takeaway',
  meal_delivery: 'Delivery',
  fast_food_restaurant: 'Fast food',
  fine_dining_restaurant: 'Fine dining',
  breakfast_restaurant: 'Breakfast',
  brunch_restaurant: 'Brunch',
  buffet_restaurant: 'Buffet',
  barbecue_restaurant: 'Barbecue',
  seafood_restaurant: 'Seafood',
  steak_house: 'Steakhouse',
  hamburger_restaurant: 'Burgers',
  pizza_restaurant: 'Pizza',
  sandwich_shop: 'Sandwiches',
  sushi_restaurant: 'Sushi',
  ramen_restaurant: 'Ramen',
  vegan_restaurant: 'Vegan',
  vegetarian_restaurant: 'Vegetarian',
  deli: 'Deli',

  // Ẩm thực theo vùng
  vietnamese_restaurant: 'Vietnamese',
  asian_restaurant: 'Asian',
  chinese_restaurant: 'Chinese',
  japanese_restaurant: 'Japanese',
  korean_restaurant: 'Korean',
  thai_restaurant: 'Thai',
  indonesian_restaurant: 'Indonesian',
  indian_restaurant: 'Indian',
  italian_restaurant: 'Italian',
  french_restaurant: 'French',
  spanish_restaurant: 'Spanish',
  greek_restaurant: 'Greek',
  turkish_restaurant: 'Turkish',
  lebanese_restaurant: 'Lebanese',
  middle_eastern_restaurant: 'Middle Eastern',
  mediterranean_restaurant: 'Mediterranean',
  mexican_restaurant: 'Mexican',
  brazilian_restaurant: 'Brazilian',
  american_restaurant: 'American',

  // Cà phê, trà, bánh
  cafe: 'Café',
  coffee_shop: 'Café',
  cat_cafe: 'Cat café',
  dog_cafe: 'Dog café',
  internet_cafe: 'Internet café',
  tea_house: 'Tea house',
  bubble_tea_store: 'Bubble tea',
  juice_shop: 'Juice bar',
  bakery: 'Bakery',
  dessert_shop: 'Desserts',
  dessert_restaurant: 'Desserts',
  ice_cream_shop: 'Ice cream',
  donut_shop: 'Donuts',
  bagel_shop: 'Bagels',
  candy_store: 'Candy',
  chocolate_shop: 'Chocolate',
  confectionery: 'Confectionery',

  // Nhậu, bar
  bar: 'Bar',
  pub: 'Pub',
  bar_and_grill: 'Bar & grill',
  wine_bar: 'Wine bar',
  night_club: 'Nightclub',
  liquor_store: 'Liquor store',

  // Giải trí
  movie_theater: 'Cinema',
  karaoke: 'Karaoke',
  bowling_alley: 'Bowling',
  amusement_park: 'Amusement park',
  amusement_center: 'Amusement center',
  video_arcade: 'Arcade',
  casino: 'Casino',
  comedy_club: 'Comedy club',
  concert_hall: 'Concert hall',
  opera_house: 'Opera house',
  philharmonic_hall: 'Philharmonic hall',
  performing_arts_theater: 'Theater',
  dance_hall: 'Dance hall',
  event_venue: 'Event venue',
  banquet_hall: 'Banquet hall',
  wedding_venue: 'Wedding venue',
  community_center: 'Community center',
  cultural_center: 'Cultural center',

  // Tham quan, ngoài trời
  tourist_attraction: 'Attraction',
  historical_landmark: 'Historical landmark',
  historical_place: 'Historical place',
  observation_deck: 'Observation deck',
  visitor_center: 'Visitor center',
  tourist_information_center: 'Tourist information',
  museum: 'Museum',
  art_gallery: 'Art gallery',
  planetarium: 'Planetarium',
  aquarium: 'Aquarium',
  zoo: 'Zoo',
  wildlife_park: 'Wildlife park',
  park: 'Park',
  national_park: 'National park',
  state_park: 'State park',
  garden: 'Garden',
  botanical_garden: 'Botanical garden',
  plaza: 'Plaza',
  water_park: 'Water park',
  hiking_area: 'Hiking area',
  marina: 'Marina',
  beach: 'Beach',

  // Thể thao
  gym: 'Gym',
  fitness_center: 'Fitness center',
  yoga_studio: 'Yoga',
  swimming_pool: 'Swimming pool',
  sports_complex: 'Sports complex',
  sports_club: 'Sports club',
  sports_activity_location: 'Sports venue',
  stadium: 'Stadium',
  arena: 'Arena',
  golf_course: 'Golf course',
  athletic_field: 'Athletic field',
  ice_skating_rink: 'Ice rink',
  skateboard_park: 'Skate park',
  playground: 'Playground',

  // Mua sắm
  shopping_mall: 'Shopping mall',
  department_store: 'Department store',
  supermarket: 'Supermarket',
  grocery_store: 'Grocery store',
  asian_grocery_store: 'Asian groceries',
  convenience_store: 'Convenience store',
  market: 'Market',
  store: 'Store',
  clothing_store: 'Clothing',
  shoe_store: 'Shoes',
  jewelry_store: 'Jewelry',
  book_store: 'Bookstore',
  electronics_store: 'Electronics',
  cell_phone_store: 'Phones',
  furniture_store: 'Furniture',
  home_goods_store: 'Home goods',
  home_improvement_store: 'Home improvement',
  hardware_store: 'Hardware',
  sporting_goods_store: 'Sporting goods',
  pet_store: 'Pet store',
  gift_shop: 'Gift shop',
  florist: 'Florist',
  discount_store: 'Discount store',
  warehouse_store: 'Warehouse store',
  wholesaler: 'Wholesaler',

  // Lưu trú
  hotel: 'Hotel',
  resort_hotel: 'Resort',
  extended_stay_hotel: 'Extended stay hotel',
  motel: 'Motel',
  hostel: 'Hostel',
  inn: 'Inn',
  guest_house: 'Guest house',
  private_guest_room: 'Guest room',
  bed_and_breakfast: 'B&B',
  farmstay: 'Farmstay',
  cottage: 'Cottage',
  campground: 'Campground',
  camping_cabin: 'Camping cabin',
  lodging: 'Lodging',
  apartment_complex: 'Apartments',

  // Dịch vụ hay xuất hiện khi search theo tên
  bank: 'Bank',
  atm: 'ATM',
  post_office: 'Post office',
  pharmacy: 'Pharmacy',
  drugstore: 'Pharmacy',
  hospital: 'Hospital',
  doctor: 'Clinic',
  dentist: 'Dentist',
  veterinary_care: 'Vet',
  spa: 'Spa',
  massage: 'Massage',
  sauna: 'Sauna',
  beauty_salon: 'Beauty salon',
  hair_salon: 'Hair salon',
  hair_care: 'Hair care',
  barber_shop: 'Barber',
  nail_salon: 'Nail salon',
  laundry: 'Laundry',
  car_repair: 'Car repair',
  car_wash: 'Car wash',
  car_rental: 'Car rental',
  car_dealer: 'Car dealer',
  gas_station: 'Gas station',
  electric_vehicle_charging_station: 'EV charging',
  parking: 'Parking',
  library: 'Library',
  preschool: 'Preschool',
  primary_school: 'Primary school',
  secondary_school: 'Secondary school',
  school: 'School',
  university: 'University',
  church: 'Church',
  mosque: 'Mosque',
  hindu_temple: 'Hindu temple',
  synagogue: 'Synagogue',
  place_of_worship: 'Place of worship',
  city_hall: 'City hall',
  courthouse: 'Courthouse',
  embassy: 'Embassy',
  police: 'Police',
  fire_station: 'Fire station',
  local_government_office: 'Government office',
  corporate_office: 'Corporate office',
  travel_agency: 'Travel agency',
  real_estate_agency: 'Real estate',
  insurance_agency: 'Insurance',
  telecommunications_service_provider: 'Telecom',
  moving_company: 'Movers',
  storage: 'Storage',
  funeral_home: 'Funeral home',
  cemetery: 'Cemetery',
  lawyer: 'Lawyer',
  accounting: 'Accounting',
  consultant: 'Consultant',

  // Giao thông
  airport: 'Airport',
  international_airport: 'International airport',
  heliport: 'Heliport',
  bus_station: 'Bus station',
  bus_stop: 'Bus stop',
  train_station: 'Train station',
  subway_station: 'Subway station',
  light_rail_station: 'Light rail station',
  transit_station: 'Transit station',
  transit_depot: 'Transit depot',
  taxi_stand: 'Taxi stand',
  ferry_terminal: 'Ferry terminal',
  rest_stop: 'Rest stop',
  truck_stop: 'Truck stop',
  park_and_ride: 'Park and ride',
};

/**
 * Type lạ (Google thêm mới liên tục) được viết hoa lại cho dễ đọc thay vì bỏ đi
 * — mất tag còn tệ hơn một tag thô, và chắc chắn không lòi snake_case ra UI.
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
 * (`cafe` và `coffee_shop` cùng ra "Café").
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
