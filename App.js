import React,{Component} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import BackgroundGeolocation from '@mauron85/react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';

export default class App extends Component {


  state={
    Name:'',
    SharingLocation:false,
    NameSet:false,
    FCMTokenStatus:false,
    Loading:true,
    NotificationPermission:false
  }

  async componentDidMount() {
    await messaging().requestPermission();
    BackgroundGeolocation.checkStatus(status => {
      let SharingLocation=false
      if(status.isRunning){
        SharingLocation=true
      }
      this.setState({SharingLocation})
    })
    const enabled = await messaging().hasPermission();
    if(enabled){
      await messaging().getToken().then((FCMToken) => this.setState({FCMToken,FCMTokenStatus:true})).catch((error)=>{
				console.log(error)
			});
    }
    messaging().onTokenRefresh(async (fcmToken) => {
        data ={FcmToken:FCMToken}
        this.fireStoreUpdate(data)
    });
    this.checkloginStatus()
    this.setState({Loading:false,NotificationPermission:enabled})
    BackgroundGeolocation.configure({
      desiredAccuracy: BackgroundGeolocation.HIGH_ACCURACY,
      stationaryRadius: 10,
      distanceFilter: 10,
      notificationTitle: 'Location sharing',
      notificationText: 'Started',
      debug: false,
      startOnBoot: false,
      stopOnTerminate: false,
      locationProvider: BackgroundGeolocation.ACTIVITY_PROVIDER,
      interval: 10000,
      fastestInterval: 5000,
      activitiesInterval: 10000,
      stopOnStillActivity: false
    });

    BackgroundGeolocation.on('location', (location) => {
      // handle your locations here
      // to perform long running operation on iOS
      // you need to create background task
      BackgroundGeolocation.startTask(taskKey => {
        // execute long running task
        // eg. ajax post location
        // IMPORTANT: task has to be ended by endTask
        this.task(location)
        BackgroundGeolocation.endTask(taskKey);
      });
    });

    BackgroundGeolocation.on('stationary', (stationaryLocation) => {
      // handle stationary locations here
      Actions.sendLocation(stationaryLocation);
    });

    BackgroundGeolocation.on('error', (error) => {
      console.log('[ERROR] BackgroundGeolocation error:', error);
    });

    BackgroundGeolocation.on('start', () => {
      console.log('[INFO] BackgroundGeolocation service has been started');
    });

    BackgroundGeolocation.on('stop', () => {
      console.log('[INFO] BackgroundGeolocation service has been stopped');
    });

    BackgroundGeolocation.on('authorization', (status) => {
      console.log('[INFO] BackgroundGeolocation authorization status: ' + status);
      if (status !== BackgroundGeolocation.AUTHORIZED) {
        // we need to set delay or otherwise alert may not be shown
        setTimeout(() =>
          Alert.alert('App requires location tracking permission', 'Would you like to open app settings?', [
            { text: 'Yes', onPress: () => BackgroundGeolocation.showAppSettings() },
            { text: 'No', onPress: () => console.log('No Pressed'), style: 'cancel' }
          ]), 1000);
      }
    });

    BackgroundGeolocation.on('background', () => {
      console.log('[INFO] App is in background');
    });

    BackgroundGeolocation.on('foreground', () => {
      console.log('[INFO] App is in foreground');
    });

    BackgroundGeolocation.headlessTask(async (event) => {
      if (event.name === 'location' ||
      event.name === 'stationary') {
        this.task(event.params)
      }
    });
    BackgroundGeolocation.checkStatus(({ isRunning }) => {
      if (isRunning) {
        BackgroundGeolocation.start(); // service was running -> rebind all listeners
      }
    });
  }

  componentWillUnmount() {
    // unregister all event listeners
    BackgroundGeolocation.removeAllListeners();
  }

checkloginStatus = async () =>{
  try {
    const value = await AsyncStorage.getItem('Name');
    if (value !== null) {
      this.setState({Name:value},this.setName)
    }
  } catch (error) {
    // Error retrieving data
  }
}

task = (location) =>{
  this.logLocation(location)
  this.fireStoreUpdate({CurrentLocation:[location.latitude, location.longitude],GeoUpdated:Date.now()})
  this.setState({rawLocation:location})
}

toggleWatch = async () => {
  BackgroundGeolocation.checkStatus(status => {
    console.log('[INFO] BackgroundGeolocation service is running', status.isRunning);
    console.log('[INFO] BackgroundGeolocation services enabled', status.locationServicesEnabled);
    console.log('[INFO] BackgroundGeolocation auth status: ' + status.authorization);

    // you don't need to check status before start (this is just the example)
    if (!status.isRunning) {
      this.setState({SharingLocation:true})
      BackgroundGeolocation.start(); //triggers start on start event
      this.fireStoreUpdate({LocationSharing:true})
    }else{
      this.setState({SharingLocation:false})
      BackgroundGeolocation.stop()
      this.fireStoreUpdate({LocationSharing:false})
    }

  });
}

 toLowerName = (name) =>{
  return name.toLowerCase();
}

fireStoreUpdate =async(data) =>{
  const user = await firestore()
  .collection('users')
  .doc(this.state.Name.toLowerCase())
  .get();
  if (user.exists) {
    await firestore().collection('users').doc(this.state.Name.toLowerCase()).update(data)
  }
}

logLocation = (data) =>{
    firestore().collection('users').doc(this.state.Name.toLowerCase()).collection('logs').doc(this.timeStampToDate(Date.now())).set(data)
}

setName= async ()=>{
  const userDoc = {
    name: this.state.Name,
    created: Date.now(),
    LocationSharing:false,
    FCMTokenStatus:this.state.FCMTokenStatus
  }
  if(this.state.FCMTokenStatus){
    userDoc.FcmToken=this.state.FCMToken
  }
  this.setState({Loading:true})
  const user = await firestore()
  .collection('users')
  .doc(this.state.Name.toLowerCase())
  .get();
  if (user.exists) {
      await firestore().collection('users').doc(this.state.Name.toLowerCase()).update(userDoc)
    } else {
      await firestore().collection('users').doc(this.state.Name.toLowerCase()).set(userDoc)
}
await AsyncStorage.setItem('Name', this.state.Name);
this.setState({NameSet:true,Loading:false})
}
timeStampToDate = (time)=>{
  let date = new Date(time)
  return date.getDate()+'-'+(date.getMonth()+1)+'-'+date.getFullYear()+' '+date.getHours()+':'+date.getMinutes()+':'+date.getSeconds();
}
renderContent=()=>{
  if(this.state.NameSet==false){
    return (
        <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
            <TextInput
              style={{width:200,padding:10,fontSize:20,borderBottomWidth:1,borderColor:'#eee',textAlign:'center'}}
              placeholder="Enter your Name"
              onChangeText={(Name) => this.setState({Name})}
              value={this.state.Name}
              onSubmitEditing={this.setName}
            />
          <TouchableOpacity style={{margin:20}} onPress={this.setName}><Text style={{fontSize:18,color:'#297cbe',fontWeight:'bold'}}>SUBMIT</Text></TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{flex:1,padding:10}}>
      <View style={styles.flexrow}><Text>Logged in as </Text><Text style={{fontWeight:'bold',color:'#297cbe'}}>{this.state.Name}</Text></View>
      <View style={{justifyContent:'center',alignItems:'center',flex:1}}>
      <Text style={{fontSize:16,marginBottom:15}}>Location Sharing</Text>
      <Switch
       onValueChange = {this.toggleWatch}
       value = {this.state.SharingLocation}/>
     {this.state.SharingLocation && this.state.rawLocation &&
       <View>
         <View style={styles.flexrow}>
           <Text style={styles.rowcontent}>Latitude:</Text>
           <Text style={styles.rowcontent}>{this.state.rawLocation.latitude}</Text>
         </View>
         <View style={styles.flexrow}>
           <Text style={styles.rowcontent}>Longitude:</Text>
           <Text style={styles.rowcontent}>{this.state.rawLocation.longitude}</Text>
         </View>
         <View style={styles.flexrow}>
           <Text style={styles.rowcontent}>Accuracy:</Text>
           <Text style={styles.rowcontent}>{this.state.rawLocation.accuracy}</Text>
         </View>
         <View style={styles.flexrow}>
           <Text style={styles.rowcontent}>LastUpdated:</Text>
           <Text style={styles.rowcontent}>{this.timeStampToDate(this.state.rawLocation.time)}</Text>
         </View>
       </View>}
    </View>
    </View>
  );
}

  render() {
    if(this.state.Loading){
      return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><ActivityIndicator size="large" color="#297cbe" /></View>
    }
    return (
      <View style={{flex:1}}>
        <View style={styles.shadowBox}>
        <Text style={{fontSize:20,color:'#297cbe',fontWeight:'bold',paddingVertical:20,paddingHorizontal:10,textAlign:'center'}}>NowPurchase Runner App</Text>
        </View>
        {this.renderContent()}
        <View style={{paddingVertical:20,paddingHorizontal:10,alignItems:'center',justifyContent:'center'}}>
          <View style={styles.flexrow}>
            <Text style={styles.rowcontent}>Notification Permission:</Text>
            <Text style={styles.rowcontent}>{this.state.NotificationPermission==true?'Allowed':'blocked'}</Text>
          </View>
        </View>
      </View>
    )

}
}
const styles = StyleSheet.create({
shadowBox: {
    borderWidth: 1,
    borderRadius: 2,
    borderColor: '#ddd',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 1,
  },
  flexrow:{
    flexDirection:'row'
  },
  rowcontent:{
    padding:10
  }
})
