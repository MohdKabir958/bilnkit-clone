import type {Order,OrderStatus,TabType} from '../types';
export interface OverviewScope {from:string;to:string;status?:string;paymentMethod?:string;vendorId?:string;activeOnly?:boolean;urgentOnly?:boolean;dutyStatus?:string;onDuty?:boolean;approvalStatus?:string;}
export type OverviewDrill=(tab:TabType,scope:OverviewScope)=>void;
export interface OverviewData {
  from:string;to:string;days:number;refreshedAt:string;cityId:string|null;
  orders:number;delivered:number;active:number;capturedPaise:number;receivedCashPaise:number;pendingCashPaise:number;
  approvedStores:number;openStores:number;pendingApprovals:number;urgentOrders:number;
  riders:{name:string;count:number}[];statuses:{name:string;count:number}[];payments:{name:string;count:number}[];
  topVendors:{id:string;name:string;orders:number}[];trend:{date:string;orders:number;capturedPaise:number;receivedCashPaise:number}[];
  definitions:{orders:string;money:string;pendingCash:string;network:string};
}
export function inOverviewScope(order:Order,scope:OverviewScope) {
  const time=Date.parse(order.createdAt);
  return time>=Date.parse(scope.from)&&time<=Date.parse(scope.to)&&(!scope.status||order.status===scope.status as OrderStatus)&&(!scope.vendorId||order.vendorId===scope.vendorId)&&(!scope.paymentMethod||order.paymentMethod===scope.paymentMethod)&&(!scope.activeOnly||!['DELIVERED','CANCELLED'].includes(order.status))&&(!scope.urgentOnly||order.otpLocked===true||order.refundStatus==='FAILED');
}
