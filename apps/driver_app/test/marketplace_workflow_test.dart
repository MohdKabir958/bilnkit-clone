import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/models/order_view.dart';
void main(){
 test('cash offer preserves collection amount while discarding any delivery code',(){final o=OrderView.tryParse({'id':'job','status':'ACCEPTED','paymentMethod':'COD','paymentStatus':'PENDING','totalAmount':205,'otpCode':'1234'})!;expect(o.isCashOnDelivery,isTrue);expect(o.totalAmount,205);expect(o.paymentStatus,'PENDING');});
 test('old prepaid offers remain compatible',(){final o=OrderView.tryParse({'id':'job','status':'ACCEPTED','paymentStatus':'PAID'})!;expect(o.isCashOnDelivery,isFalse);});
}
