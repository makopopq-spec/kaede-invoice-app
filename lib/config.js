// 同じアプリを別会社(姉妹会社など)にも展開できるよう、会社情報・振込先は環境変数で
// 上書き可能にしている。環境変数を設定しない既存デプロイでは、これまで通り
// 楓Care taxiの情報がそのまま使われる(動作に変更なし)。
const COMPANY = {
  name: process.env.COMPANY_NAME || "楓Care taxi",
  representative: process.env.COMPANY_REPRESENTATIVE || "高橋雅子",
  postalCode: process.env.COMPANY_POSTAL_CODE || "704-8172",
  address: process.env.COMPANY_ADDRESS || "岡山県岡山市東区大多羅町82-13",
  tel: process.env.COMPANY_TEL || "086-230-1356",
  email: process.env.COMPANY_EMAIL || "kaedecare2021@gmail.com",
  invoiceRegistrationNumber: process.env.COMPANY_INVOICE_REGISTRATION_NUMBER || "",
};

const BANK = {
  bankName: process.env.BANK_NAME || "おかやま信用金庫",
  branchName: process.env.BANK_BRANCH_NAME || "松新町支店",
  accountType: process.env.BANK_ACCOUNT_TYPE || "普通",
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || "0452002",
  accountHolder: process.env.BANK_ACCOUNT_HOLDER || "タカハシ　マサコ",
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
