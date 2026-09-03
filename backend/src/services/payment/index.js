const PaymentManager = require('./PaymentManager');
const MobileMoneyProvider = require('./providers/mobileMoney');
const CardProvider = require('./providers/card');
const CashProvider = require('./providers/cash');
const CautoWalletProvider = require('./providers/wallet');

const PAYMENT_METHODS = ['MOBILE_MONEY', 'CARD', 'CASH', 'CAUTO_WALLET'];

const paymentManager = new PaymentManager();
paymentManager.register(new MobileMoneyProvider('MTN_MOMO'));
paymentManager.register(new MobileMoneyProvider('MOOV_MONEY'));
paymentManager.register(new MobileMoneyProvider('WAVE'));
paymentManager.register(new MobileMoneyProvider('ORANGE_MONEY'));
paymentManager.register(new CardProvider());
paymentManager.register(new CashProvider());
paymentManager.register(new CautoWalletProvider());

module.exports = { paymentManager, PaymentManager, PAYMENT_METHODS };