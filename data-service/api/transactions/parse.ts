import { Money, Asset, BigNumber, OrderPrice, AssetPair } from '@waves/data-entities';
import { TRANSACTION_TYPE_NUMBER, utils, libs } from '@waves/waves-signature-generator';
import { get } from '../assets/assets';
import {
    txApi,
    ITransfer,
    IExchange,
    IExchangeOrder,
    T_API_TX,
    T_TX,
    ILease,
    ICancelLeasing, ICreateAlias, IMassTransfer, IIssue, IReissue, IBurn
} from './interface';
import { normalizeAssetId, normalizeAssetPair, normalizeRecipient, toHash } from '../../utils/utils';
import { WAVES_ID } from '@waves/waves-signature-generator';
import { IHash } from '../../interface';


// TODO Remove is tokens flag after support Dima's api
export function parseTx(transactions: Array<T_API_TX>, isUTX: boolean, isTokens?: boolean): Promise<Array<T_TX>> {
    const hash = Object.create(null);
    hash[WAVES_ID] = true;
    transactions.forEach((tx) => getAssetsHashFromTx(tx, hash));

    return get(Object.keys(hash))
        .then((assets) => toHash(assets, 'id'))
        .then((hash) => {
            return transactions.map((transaction) => {
                switch (transaction.type) {
                    case TRANSACTION_TYPE_NUMBER.SEND_OLD:
                        return parseTransferTx(remapOldTransfer(transaction), hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.ISSUE:
                        return parseIssueTx(transaction, hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.TRANSFER:
                        return parseTransferTx(transaction, hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.REISSUE:
                        return parseReissueTx(transaction, hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.BURN:
                        return parseBurnTx(transaction, hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.EXCHANGE:
                        return parseExchangeTx(transaction, hash, isUTX, isTokens);
                    case TRANSACTION_TYPE_NUMBER.LEASE:
                        return parseLeasingTx(transaction, hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.CANCEL_LEASING:
                        return parseCancelLeasingTx(transaction, hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.CREATE_ALIAS:
                        return parseCreateAliasTx(transaction, hash, isUTX);
                    case TRANSACTION_TYPE_NUMBER.MASS_TRANSFER:
                        return parseMassTransferTx(transaction, hash, isUTX);
                    default:
                        return transaction;
                }
            });
        });
}

export function getAssetsHashFromTx(transaction: T_API_TX, hash = Object.create(null)): IHash<boolean> {
    hash[WAVES_ID] = true;
    switch (transaction.type) {
        case TRANSACTION_TYPE_NUMBER.ISSUE:
            hash[normalizeAssetId(transaction.id)] = true;
            break;
        case TRANSACTION_TYPE_NUMBER.REISSUE:
        case TRANSACTION_TYPE_NUMBER.BURN:
        case TRANSACTION_TYPE_NUMBER.MASS_TRANSFER:
            hash[normalizeAssetId(transaction.assetId)] = true;
            break;
        case TRANSACTION_TYPE_NUMBER.TRANSFER:
            hash[normalizeAssetId(transaction.assetId)] = true;
            hash[normalizeAssetId(transaction.feeAsset)] = true;
            break;
        case TRANSACTION_TYPE_NUMBER.EXCHANGE:
            hash[normalizeAssetId(transaction.order1.assetPair.amountAsset)] = true;
            hash[normalizeAssetId(transaction.order1.assetPair.priceAsset)] = true;
            break;

    }
    return hash;
}

export function remapOldTransfer(tx: txApi.IOldTransferTx): txApi.ITransfer {
    const type = TRANSACTION_TYPE_NUMBER.TRANSFER;
    const assetId = WAVES_ID;
    return { ...tx, type, assetId, attachment: '', feeAsset: WAVES_ID };
}

export function parseIssueTx(tx: txApi.IIssue, assetsHash: IHash<Asset>, isUTX: boolean): IIssue {
    const quantity = new Money(new BigNumber(tx.quantity), assetsHash[normalizeAssetId(tx.id)]);
    const fee = new Money(new BigNumber(tx.fee), assetsHash[WAVES_ID]);
    return { ...tx, quantity, fee, isUTX };
}

export function parseTransferTx(tx: txApi.ITransfer, assetsHash: IHash<Asset>, isUTX: boolean): ITransfer {
    const bytes = libs.base58.decode(tx.attachment);
    let attachment;
    try {
        attachment = libs.converters.byteArrayToString(bytes);
    } catch (e) {
        attachment = null;
    }
    const rawAttachment = tx.attachment;
    const recipient = normalizeRecipient(tx.recipient);
    const amount = new Money(new BigNumber(tx.amount), assetsHash[normalizeAssetId(tx.assetId)]);
    const fee = new Money(new BigNumber(tx.fee), assetsHash[normalizeAssetId(tx.feeAsset)]);
    const assetId = normalizeAssetId(tx.assetId);
    return { ...tx, amount, fee, assetId, isUTX, attachment, rawAttachment, recipient };
}

export function parseReissueTx(tx: txApi.IReissue, assetsHash: IHash<Asset>, isUTX: boolean): IReissue {
    const quantity = new Money(new BigNumber(tx.quantity), assetsHash[normalizeAssetId(tx.assetId)]);
    const fee = new Money(new BigNumber(tx.fee), assetsHash[WAVES_ID]);
    return { ...tx, quantity, fee, isUTX };
}

export function parseBurnTx(tx: txApi.IBurn, assetsHash: IHash<Asset>, isUTX: boolean): IBurn {
    const amount = new Money(new BigNumber(tx.amount), assetsHash[normalizeAssetId(tx.assetId)]);
    const fee = new Money(new BigNumber(tx.fee), assetsHash[WAVES_ID]);
    return { ...tx, amount, fee, isUTX };
}

export function parseExchangeTx(tx: txApi.IExchange, assetsHash: IHash<Asset>, isUTX: boolean, isTokens?: boolean): IExchange {
    const create = (count: string) => isTokens ? Money.fromTokens(count, assetsHash[WAVES_ID]) : new Money(count, assetsHash[WAVES_ID]);
    const order1 = parseExchangeOrder(tx.order1, assetsHash, isTokens);
    const order2 = parseExchangeOrder(tx.order2, assetsHash, isTokens);
    const orderHash = {
        [order1.orderType]: order1,
        [order2.orderType]: order2
    };
    const buyOrder = orderHash.buy;
    const sellOrder = orderHash.sell;
    const price = order1.price;
    const amount = order1.amount.cloneWithTokens(BigNumber.min(order1.amount.getTokens(), order2.amount.getTokens()));
    const buyMatcherFee = create(tx.buyMatcherFee);
    const sellMatcherFee = create(tx.sellMatcherFee);
    const fee = create(tx.fee);
    return { ...tx, order1, order2, price, amount, buyMatcherFee, sellMatcherFee, fee, isUTX, buyOrder, sellOrder };
}

export function parseLeasingTx(tx: txApi.ILease, assetsHash: IHash<Asset>, isUTX: boolean): ILease {
    const amount = new Money(new BigNumber(tx.amount), assetsHash[WAVES_ID]);
    const fee = new Money(new BigNumber(tx.fee), assetsHash[WAVES_ID]);
    const recipient = normalizeRecipient(tx.recipient);
    const isActive = tx.status === 'active';
    return { ...tx, amount, fee, isUTX, recipient, isActive };
}

export function parseCancelLeasingTx(tx: txApi.ICancelLeasing, assetsHash: IHash<Asset>, isUTX: boolean): ICancelLeasing {
    const lease = parseLeasingTx(tx.lease, assetsHash, false);
    const fee = new Money(new BigNumber(tx.fee), assetsHash[WAVES_ID]);
    return { ...tx, lease, fee, isUTX };
}

export function parseCreateAliasTx(tx: txApi.ICreateAlias, assetsHash: IHash<Asset>, isUTX: boolean): ICreateAlias {
    const fee = new Money(new BigNumber(tx.fee), assetsHash[WAVES_ID]);
    return { ...tx, fee, isUTX };
}

export function parseMassTransferTx(tx: txApi.IMassTransfer, assetsHash: IHash<Asset>, isUTX: boolean): IMassTransfer {
    const fee = new Money(new BigNumber(tx.fee), assetsHash[WAVES_ID]);
    const totalAmount = new Money(new BigNumber(tx.totalAmount), assetsHash[normalizeAssetId(tx.assetId)]);
    const transfers = tx.transfers.map((transfer) => ({
        recipient: normalizeRecipient(transfer.recipient),
        amount: new Money(new BigNumber(transfer.amount), assetsHash[normalizeAssetId(tx.assetId)])
    }));
    const bytes = libs.base58.decode(tx.attachment);
    let attachment;
    try {
        attachment = libs.converters.byteArrayToString(bytes);
    } catch (e) {
        attachment = null;
    }
    const rawAttachment = tx.attachment;
    return { ...tx, totalAmount, transfers, fee, isUTX, attachment, rawAttachment };
}

function parseExchangeOrder(order: txApi.IExchangeOrder, assetsHash: IHash<Asset>, isTokens?: boolean): IExchangeOrder {
    const create = (count: string, asset: Asset) => isTokens ? Money.fromTokens(count, asset) : new Money(count, asset);
    const assetPair = normalizeAssetPair(order.assetPair);
    const pair = new AssetPair(assetsHash[assetPair.amountAsset], assetsHash[assetPair.priceAsset]);
    const price = isTokens ? Money.fromTokens(order.price, pair.priceAsset) : Money.fromTokens(new OrderPrice(new BigNumber(order.price), pair).getTokens(), pair.priceAsset);
    const amount = create(order.amount, assetsHash[assetPair.amountAsset]);
    const matcherFee = create(order.matcherFee, assetsHash[WAVES_ID]);
    return { ...order, price, amount, matcherFee, assetPair };
}
