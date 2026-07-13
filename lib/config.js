const COMPANY = {
  name: "楓Care taxi",
  representative: "高橋雅子",
  postalCode: "704-8172",
  address: "岡山県岡山市東区大多羅町82-13",
  tel: "086-230-1356",
  email: "kaedecare2021@gmail.com",
  invoiceRegistrationNumber: "",
};

const BANK = {
  bankName: "おかやま信用金庫",
  branchName: "松新町支店",
  accountType: "普通",
  accountNumber: "0452002",
  accountHolder: "タカハシ　マサコ",
};

const ITEM_COLUMNS = [
  { key: "date", label: "ご利用日時" },
  { key: "detail", label: "詳細" },
  { key: "fare", label: "運賃", numeric: true },
  { key: "equipment", label: "機材料", numeric: true },
  { key: "care", label: "介助料", numeric: true },
  { key: "etc", label: "ETC料金", numeric: true },
  { key: "discount", label: "割引", numeric: true, isDiscount: true },
];

module.exports = { COMPANY, BANK, ITEM_COLUMNS };
