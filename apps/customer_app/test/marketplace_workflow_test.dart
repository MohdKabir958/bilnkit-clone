import 'package:customer_app/models/dhaba.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:customer_app/models/order.dart';
import 'package:customer_app/models/order_group.dart';
import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:customer_app/services/order_api.dart';
import 'support/order_fakes.dart';

void main(){
 tearDown(()=>CustomerApiService.httpClientOverride=null);
 test('new storefront category chips describe stores, independently of product categories',(){final p=DhabaProvider(dhabas:[Dhaba.fromJson({'id':'store','name':'QA Store','category':'Vegetable shops','primaryCategoryId':'vegetables'})],menus:{});expect(p.categories,['All','Vegetable shops']);p.dispose();});
 test('cash order is not offered an online payment retry',(){final o=OrderModel.tryParse({...orderJson(),'paymentMethod':'COD'})!;expect(o.isCashOnDelivery,isTrue);expect(o.awaitsPayment,isFalse);expect(o.totalAmount,245);expect(o.canCancel,isTrue);});
 test('new cart remains one store even when an older quote advertises a higher limit',(){final cart=CartProvider();cart.setMaxRestaurants(5);expect(cart.maxRestaurants,1);});
 test('cash checkout sends server-priced items and the selected address to v2',()async{
  CustomerApiService.selectedAddressId='addr';
  CustomerApiService.httpClientOverride=MockClient((r)async{expect(r.url.path,'/api/v2/checkout');final b=jsonDecode(r.body) as Map;expect(b['addressId'],'addr');expect(b['paymentMethod'],'COD');expect(b.containsKey('totalAmount'),isFalse);return http.Response(jsonEncode({'success':true,'data':{...orderJson(),'paymentMethod':'COD'}}),201);});
  final out=await const HttpOrderApi().createOrder(const CreateOrderRequest(vendorId:'shop',items:[(itemId:'milk',quantity:2)],dropoffHostel:'Home',dropoffNotes:'',clientRequestId:'checkout-001',paymentMethod:'COD'));expect(out.ok,isTrue);expect(out.value!.awaitsPayment,isFalse);
 });
 test('quote exposes only the backend-enabled payment methods',(){final q=OrderQuote.tryParse({'restaurantCount':1,'subtotal':180,'total':205,'fees':{'total':25,'base':25},'discount':0,'perRestaurant':[],'maxRestaurants':1,'paymentMethods':['ONLINE','COD']});expect(q!.paymentMethods,contains('COD'));});
}
