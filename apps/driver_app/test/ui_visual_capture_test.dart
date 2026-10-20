// Real rider production widgets rendered with test-only API/socket/location fixtures.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:driver_app/screens/login_screen.dart';
import 'package:driver_app/screens/driver_home.dart';
import 'package:driver_app/screens/active_delivery.dart';
import 'package:driver_app/screens/earnings_history.dart';
import 'package:driver_app/services/partner_auth_service.dart';
import 'package:driver_app/services/rider_orders_api.dart';
import 'package:driver_app/state/rider_controller.dart';
import 'package:driver_app/widgets/gate_otp_dialog.dart';
import 'package:driver_app/widgets/swipe_accept_card.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import 'support/fake_rider.dart';

void main(){
 setUpAll(loadVisualFonts);
 testWidgets('capture rider production screens with isolated service fixtures',(tester)async{
  await prepareVisual(tester);SharedPreferences.setMockInitialValues({});
  Widget host(Widget child)=>captureRoot(MaterialApp(theme:KraveoTheme.driver(),home:child));
  Future<void> show(Widget child,String name)async{await tester.pumpWidget(host(child));await captureVisual(tester,'delivery',name);await tester.pumpWidget(const SizedBox());await tester.pump(const Duration(seconds:6));}
  await show(LoginScreen(onSubmit:(_,__)async=>const LoginResult.failure(LoginFailure.server)),'login');
  final fake=FakeRider();
  await show(DriverHomeScreen(services:fake.services),'home');
  await show(Scaffold(body:SafeArea(child:Padding(padding:const EdgeInsets.all(20),child:OfferCard(order:offer(vendorName:'Green Basket Market',drop:'Indiranagar'),onAccepted:(){},now:testNow)))),'delivery-offer');
  final active=order(status:'READY_FOR_PICKUP',vendorName:'Green Basket Market',drop:'Indiranagar');
  fake.api.active=ApiResult.ok([active]);
  final controller=RiderController(fake.services,myIds:{'u-rider'});await controller.start();
  await show(ActiveDeliveryScreen(controller:controller,onGoHome:(){}),'active-delivery');
  await show(GateOtpDialog(orderRef:'GZ-301',customerName:'Aarav',gateName:'Delivery address',onSubmit:(_)async=>const OtpOutcome(OtpOutcomeKind.network)),'delivery-verification');
  await show(EarningsHistoryScreen(controller:controller),'earnings');
  controller.dispose();
 },skip:!captureEnabled);
}
