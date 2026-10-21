import 'package:flutter_test/flutter_test.dart';
import 'package:vendor_app/models/order_model.dart';
import 'support/fakes.dart';
void main(){
 test('cash order is visible and actionable without pretending it was paid online',(){final o=OrderModel.fromJson({...orderJson(),'paymentMethod':'COD','paymentStatus':'PENDING'})!;expect(o.isCashOnDelivery,isTrue);expect(o.isVisibleToVendor,isTrue);expect(o.isIncoming,isTrue);expect(o.isPaid,isFalse);});
 test('an unpaid online order remains hidden from the store queue',(){final o=OrderModel.fromJson({...orderJson(),'paymentMethod':'ONLINE','paymentStatus':'PENDING'})!;expect(o.isVisibleToVendor,isFalse);expect(o.isIncoming,isFalse);});
}
