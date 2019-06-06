var sensorLib = require("node-dht-sensor");
var request = require('ajax-request');
var io = require('socket.io-client');
var ipAddress = 'http://168.63.232.214:8080'
var sc = io.connect(ipAddress);
var config = require('./config/config');
var gpio = require('rpi-gpio');
var mcpadc = require("mcp-spi-adc");
var time = new Date();
var urlData = ipAddress + '/data/record';
var urlSetting = ipAddress + '/relay/config/5c7ebb4267722562b4cc4395';
var urlRelayUpdate = ipAddress + '/relay/update/5c7ebb4267722562b4cc4395';
var urlNotif = ipAddress + '/users/notif';


// fuzzy
var fuzzyValue = 0;


// fuzzy temperature
var tempMin = [0, 20, 25, 30, 35];
var tempMax = [25, 30, 35, 40, 80];
var strTemp = ["Dingin", "Sejuk", "Normal", "Sedang", "Panas"];

// fuzzy humidity
var humMin = [0, 25, 60];
var humMax = [55, 75, 100];
var strHum = ["Kering", "Lembab", "Basah"];

// fuzzy rule
var ruleMin = [0, 1, 2.5, 3.75, 5, 7, 8];
var ruleMax = [2, 3, 5, 6.25, 7.5, 9, 10];
var rulePeak= [1, 2, 3.75, 5, 6.25, 8, 9];
var ruleCategory = [200, 300, 500, 600, 700, 900, 1000];
var strRule = ["Sangat Sedikit", "Sedikit", "Agak Sedikit", "Sedang", "Agak Banyak", "Banyak", "Sangat Banyak"];


var app = {
    isPumpOn: "OFF",
    isAutoPumpOn: "ON",
    isRuleFuzzyTemp: "__",
    isRuleFuzzyHum: "__",
    isRuleFuzzyWater: "__",
    currentTargetSoil: 50,
    currentTemp:0,
    currentHumid:0,
    currentSoil: 0,
    currentWater:0,
    currentSetTimeout:0,
    currentTime: time,
    autoPumpInterval:0,
    autoPumpSetTimeout:0,
    sensors: {
        name: "Outdoor",
        type: 22,
        pin: 22
    },

    collectData: function(){
       setInterval(function(){
        var sensor1 = new Promise(function(resolve, reject){

            for(var a in app.sensors){
                var b = sensorLib.read(app.sensors.type, app.sensors.pin)
                console.log(app.sensors.name + ": " +
                b.temperature.toFixed(1) + "°C, " +
                b.humidity.toFixed(1) + "%");    
                app.currentTemp = b.temperature.toFixed(1);
                app.currentHumid = b.humidity.toFixed(1);
                resolve();
            }
        });

        var sensor2 = new Promise(function(resolve, reject){
            var soilSensor = mcpadc.open(0,{speedHz:20000},function(err){
                if (err) throw err;
                soilSensor.read(function(err, reading){
                    if (err) throw err;
                    
                    //reading.value returns a number between 0 and 1. 
                    //if totally dry conditions, returns 1.  Sensor submerged in water returns ~0.5  
                    function map(x, in_min, in_max, out_min, out_max){ 
                            return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
                    }
                    var curValue = map(reading.value, 0, 1, 100, 0).toFixed(1);
                    console.log("soil persen : " + curValue + "%");
                    console.log("soil moisture reading : " + (1023 - ((reading.value * 3.3 - 0.5) * 100).toFixed(2)) );
                    app.currentSoil = curValue;
                    resolve();
                });
            });
        })

        var fuzzyTes = new Promise(function(resolve, reject){
            fuzzyValue = Math.round((app.calculateFuzzy(Math.round(app.currentTemp), Math.round(app.currentSoil)))*50);
            console.log(fuzzyValue);
            app.currentWater = fuzzyValue ? fuzzyValue : app.currentSetTimeout;
            resolve();
        })

        // record data all
        Promise.all([sensor1, sensor2, fuzzyTes]).then(function(){
            app.recordData();
        })
       },2000)
    },

    // ai fuzzy
    calculateFuzzy: function(temp, hum){
        console.log("Temp : "  + temp);
        console.log("Hum : " + hum);
        
        //temperature
        console.log("Temperature");
        if(temp <= tempMin[1]){
            var hasilTemp   = app.searchTemp1(0);
            var strValTemp  = hasilTemp.strValTemp; 
            var valTemp     = hasilTemp.valTemp; 
            var statusTemp  = hasilTemp.statusTemp;
        } else if (temp >= tempMax[3]){
            var hasilTemp   = app.searchTemp1(4);
            var strValTemp  = hasilTemp.strValTemp; 
            var valTemp     = hasilTemp.valTemp; 
            var statusTemp  = hasilTemp.statusTemp;
        } else if (temp == tempMax[0]){
            var hasilTemp   = app.searchTemp1(1);
            var strValTemp  = hasilTemp.strValTemp; 
            var valTemp     = hasilTemp.valTemp; 
            var statusTemp  = hasilTemp.statusTemp;
        } else if (temp == tempMax[1]){
            var hasilTemp   = app.searchTemp1(2);
            var strValTemp  = hasilTemp.strValTemp; 
            var valTemp     = hasilTemp.valTemp; 
            var statusTemp  = hasilTemp.statusTemp;
        } else if (temp == tempMax[2]){
            var hasilTemp   = app.searchTemp1(3);
            var strValTemp  = hasilTemp.strValTemp; 
            var valTemp     = hasilTemp.valTemp; 
            var statusTemp  = hasilTemp.statusTemp;
        } else {
            var valTemp     =[]; 
            var strValTemp  =[]; 
            var statusTemp  =0;
            var hasilTemp   = app.searchTemp2(temp);
            strValTemp[0]   = hasilTemp[0]; 
            valTemp[0]      = hasilTemp[1], strValTemp[1]=hasilTemp[2], valTemp[1]=hasilTemp[3], statusTemp=hasilTemp[4];
    
        // console.log(strValTemp[0]+' '+strValTemp[1]);
        // console.log(valTemp[0]+' '+valTemp[1]);
        }
        
        //humidity
        console.log("\nHumidity");
        
        if (hum <= humMin[1]){
            var hasilHum    = app.searchHum1(0);
            var strValHum  = hasilHum.strValHum; 
            var valHum     = hasilHum.valHum; 
            var statusHum  = hasilHum.statusHum;
        } else if (hum >= humMax[2]){
            var hasilHum    = app.searchHum1(2);
            var strValHum  = hasilHum.strValHum; 
            var valHum     = hasilHum.valHum; 
            var statusHum  = hasilHum.statusHum;
        } else if (((hum >= humMax[0] && hum <= humMin[2]) || (hum == humMax[0] || hum == humMin[2]))){
            var hasilHum    = app.searchHum1(1);
            var strValHum  = hasilHum.strValHum; 
            var valHum     = hasilHum.valHum; 
            var statusHum  = hasilHum.statusHum;
        } else {
            var valHum      =[]; 
            var strValHum   =[]; 
            var statusHum   =0;
            var hasilHum    = app.searchHum2(hum);
            strValHum[0]    = hasilHum[0]; 
            valHum[0]      = hasilHum[1], strValHum[1]=hasilHum[2], valHum[1]=hasilHum[3], statusHum=hasilHum[4];

            // console.log(strValHum[0]+' '+strValHum[1]);
            // console.log(valHum[0]+' '+valHum[1]);
        }
        
        //perhitungan
        console.log("\nPerhitungan");
        console.log(statusTemp+" "+statusHum);
        var sumZxA=0; 
        var sumA = 0;
        var index=[]; 
        var rule=[]; 
        var valRule=[]; 
        var z=[];
        // console.log(strValTemp[0]+' '+strValTemp[1]);
        // console.log(valTemp[0]+' '+valTemp[1]);
        if(statusTemp == 1 && statusHum == 1){
            var hasilSearch = app.searchRule(strValTemp, valTemp, strValHum, valHum, 1, 10);
            index = hasilSearch[0]; rule = hasilSearch[1]; valRule = hasilSearch[2]; z = hasilSearch[3];
            console.log(rule + " : " + valRule + " -> z= " + z);
            sumSZxA = sumZxA + (z*valRule);
            sumA = sumA + (valRule)*1;
            
        } else if(statusTemp == 1 && statusHum == 2){
            for (var i=0; i<=1; i++){
                var hasilSearch = app.searchRule(strValTemp, valTemp, strValHum[i], valHum[i], 2, i);
                index[i] = hasilSearch[0]; rule[i] = hasilSearch[1]; valRule[i] = hasilSearch[2]; z[i] = hasilSearch[3];
                console.log(rule[i] + " : " + valRule[i] + " -> z= " + z[i]);
                sumZxA = sumZxA + (z[i]*valRule[i]);
                sumA = sumA + (valRule[i])*1;
            }
        } else if(statusTemp == 2 && statusHum == 1){
            for (var i=0; i<=1; i++){
                var hasilSearch = app.searchRule(strValTemp[i], valTemp[i], strValHum, valHum, 2, i);
                index[i] = hasilSearch[0]; rule[i] = hasilSearch[1]; valRule[i] = hasilSearch[2]; z[i] = hasilSearch[3];
                console.log(rule[i] + " : " + valRule[i] + " -> z= " + z[i]);
                sumZxA = sumZxA + (z[i]*valRule[i]);
                console.log(sumA+valRule[i]);
                sumA = sumA + (valRule[i])*1;
            }
            
        } else if(statusTemp == 2 && statusHum == 2){
            var count=0;
            for(var i=0; i<=1; i++){
                for(var j=0; j<=1; j++){
                    var hasilSearch = app.searchRule(strValTemp[i], valTemp[i], strValHum[j], valHum[j], 3, count);
                    index[count] = hasilSearch[0]; 
                    rule[count] = hasilSearch[1]; 
                    valRule[count] = hasilSearch[2]; 
                    z[count] = hasilSearch[3];
    
    
                    console.log(rule[count] + " : " + valRule[count]);
                    console.log( " -> z : "+z[count]);
                    
                    sumZxA = sumZxA + (z[count]*valRule[count]);
                    sumA = sumA + (valRule[count])*1;
                    
                    count++;
                }
            }
        }
        console.log(valRule);
        
        var zAkhir = (sumZxA / sumA).toFixed(2);

        // rule akhir
        if(zAkhir >= ruleMin[0] && zAkhir <= ruleMax[0] ){
            app.isRuleFuzzyWater = strRule[0]
        }else if(zAkhir >= ruleMin[1] && zAkhir <= ruleMax[1]){
            app.isRuleFuzzyWater = strRule[1]
        }else if(zAkhir >= ruleMin[2] && zAkhir <= ruleMax[2]){
            app.isRuleFuzzyWater = strRule[2]
        }else if(zAkhir >= ruleMin[3] && zAkhir <= ruleMax[3]){
            app.isRuleFuzzyWater = strRule[3]
        }else if(zAkhir >= ruleMin[4] && zAkhir <= ruleMax[4]){
            app.isRuleFuzzyWater = strRule[4]
        }else if(zAkhir >= ruleMin[5] && zAkhir <= ruleMax[5]){
            app.isRuleFuzzyWater = strRule[5]
        }else if(zAkhir >= ruleMin[6] && zAkhir <= ruleMax[6]){
            app.isRuleFuzzyWater = strRule[6]
        }
        console.log("Z akhir : " + sumZxA+"/"+sumA);
        console.log("Z akhir : " + app.isRuleFuzzyWater + " : "+ zAkhir);
        return zAkhir;
    },

    searchTemp1: function(i){
        var valTemp = 1; 
        var strValTemp = strTemp[i];
        var statusTemp = 1;
        app.isRuleFuzzyTemp = strValTemp;
        console.log(strValTemp + " : " + valTemp)
        return [valTemp, strValTemp, statusTemp];
    },
    
     searchTemp2: function(temp){
        var flag1 =0; 
        var flag2=0;
        for(var i=0; i<=4; i++){
            //mencari temp bawah
            if (temp > tempMin[i] && temp < tempMax[i-1] && flag1 == 0){
                var Min = tempMin[i];
                var strValTempBawah = strTemp[i];
                console.log(strValTempBawah + " = " + Min);
                flag1=1;
            }
            
            //mencari temp atas
            if(temp < tempMax[i] && temp > tempMin[i+1] && flag2 == 0){
                var Max = tempMax[i];
                var strValTempAtas = strTemp[i];
                console.log(strValTempAtas + " = " + Max);
                flag2=1;
            }
        }
        
        var valTempAtas   = ((Max-temp)/(Max-Min)).toFixed(2);
        var valTempBawah  = ((temp-Min)/(Max-Min)).toFixed(2);
        var statusTemp = 2;

        if(valTempAtas > valTempBawah){
            app.isRuleFuzzyTemp = strValTempAtas;
        }else {
            app.isRuleFuzzyTemp = strValTempBawah;
        }
        
        console.log(strValTempAtas + " : " + valTempAtas + " " + strValTempBawah + " : " + valTempBawah);
        return [strValTempAtas, valTempAtas, strValTempBawah, valTempBawah, statusTemp];
    },
    
     searchHum1: function(i){
        var valHum = 1; 
        var strValHum = strHum[i];
        var statusHum = 1;
        app.isRuleFuzzyHum = strValHum;
        console.log(strValHum + " : " + valHum);
        return [valHum, strValHum, statusHum];
    },
    
     searchHum2: function(hum){
        var flag1=0; 
        var flag2=0;
        for (var i=0; i<=2; i++){
            //mencari hum bawah
            if (hum > humMin[i] && hum < humMax[i-1] && flag1 == 0){
                var Min = humMin[i];
                var strValHumBawah = strHum[i];
                console.log(strValHumBawah + " = " + Min);
                flag1=1;
            }
            
            //mencari hum atas
            if(hum < humMax[i] && hum > humMin[i+1] && flag2 == 0){
                var Max = humMax[i];
                var strValHumAtas = strHum[i];
                console.log(strValHumAtas + " = " + Max);
                flag2=1;
            }
        }
        
        var valHumAtas   = ((Max-hum)/(Max-Min)).toFixed(2);
        var valHumBawah  = ((hum-Min)/(Max-Min)).toFixed(2);
        var statusHum = 2;

        if(valHumAtas > valHumBawah){
            app.isRuleFuzzyHum = strValHumAtas;
        }else {
            app.isRuleFuzzyHum = strValHumBawah;
        }
        console.log(strValHumAtas + " : " + valHumAtas + " " + strValHumBawah + " : " + valHumBawah);
        return [strValHumBawah, valHumBawah, strValHumAtas, valHumAtas, statusHum];
    },
    
     searchRule: function(strTempInp, valTemp, strHumInp, valHum, type, pos){
        var str="";
        var i=0;
        var valRule=0;
        if (valHum > valTemp){
            valRule = valTemp;
        }else {
            valRule = valHum;
        }
        console.log(strTempInp+' '+strHumInp);
        if (strTempInp == strTemp[0] && strHumInp == strHum[0]){ // Dingin Kering
            i=2;
        } else if (strTempInp == strTemp[1] && strHumInp == strHum[0]){ // Sejuk Kering
            i=3;
        } else if (strTempInp == strTemp[2] && strHumInp == strHum[0]){ // Normal Kering
            i=4;
        } else if (strTempInp == strTemp[3] && strHumInp == strHum[0]){ // Sedang Kering
            i=5;
        } else if (strTempInp == strTemp[4] && strHumInp == strHum[0]){ // Panas Kering
            i=6;
        } else if (strTempInp == strTemp[0] && strHumInp == strHum[1]){ // Dingin Lembab
            i=1;
        } else if (strTempInp == strTemp[1] && strHumInp == strHum[1]){ // Sejuk Lembab
            i=2;
        } else if (strTempInp == strTemp[2] && strHumInp == strHum[1]){ // Normal Lembab
            i=3;
        } else if (strTempInp == strTemp[3] && strHumInp == strHum[1]){ // Sedang Lembab
            i=4;
        } else if (strTempInp == strTemp[4] && strHumInp == strHum[1]){ // Panas Lembab
            i=5;
        } else if (strTempInp == strTemp[0] && strHumInp == strHum[2]){ // Dingin Basah
            i=0;
        } else if (strTempInp == strTemp[1] && strHumInp == strHum[2]){ // Sejuk Basah
            i=1;
        } else if (strTempInp == strTemp[2] && strHumInp == strHum[2]){ // Normal Basah
            i=2;
        } else if (strTempInp == strTemp[3] && strHumInp == strHum[2]){ // Sedang Basah
            i=3;
        } else if (strTempInp == strTemp[4] && strHumInp == strHum[2]){ // Panas Basah
            i=4;
        }
        
        var z;
        if (type == 1){ 
        z = rulePeak[i];
        } else {
            if (pos % 2 == 0) 		{
                z=((ruleMax[i] - (valRule * (ruleMax[i] - rulePeak[i])))).toFixed(2);
                console.log(valRule+" = ("+ruleMax[i]+"-"+z+")/("+rulePeak[i]+"-"+ruleMin[i]+")");
            }
            else if (pos % 2 == 1)	{
                z=((ruleMin[i] + (valRule * (rulePeak[i] - ruleMin[i])))).toFixed(2);
                console.log(valRule+" = ("+z+"-"+ruleMin[i]+")/("+rulePeak[i]+"-"+ruleMin[i]+")");
            }
        }
        
        str = strRule[i];
        return  [i, str, valRule, z];
    },

    recordData: function(){
        // post req
        request({
            url: urlData,
            method: 'POST',
            data: {
                temp: app.currentTemp,
                humidity: app.currentHumid,
                soilMoisture: app.currentSoil,
                waterVolume: app.currentWater,
                pumpOn: app.isPumpOn,
                autoPumpOn: app.isAutoPumpOn,
                ruleFuzzyTemp: app.isRuleFuzzyTemp,
                ruleFuzzyHum: app.isRuleFuzzyHum,
                ruleFuzzyWater: app.isRuleFuzzyWater,
                targetSoil: app.currentTargetSoil,
                time: app.currentTime,
            }
        }, function(err, res, data){
            if(err){
                return(err)
            }
            // var status = JSON.stringify(data) 
            var obj = JSON.parse(data)
            var status = JSON.stringify(obj.sensor)
            sc.emit('readSensor', status)
            console.log("data posted");
        })
    },
    
    initApp: function(){
        this.initGPIO();
        this.getSettings();
        this.collectData();
    },

    getSettings:function(){
        //interval defines how often we check server for new settings
        setInterval(function(){

            request({
                url: urlSetting,
                method: 'GET'
            }, function(err, res, body) {
                
                if(err){
                    return(err);
                }
                var status = JSON.parse(body);
                
                //update pump
                if(status.pumpOn === "ON"){
                    app.pumpOn();
                }else{
                    app.pumpOff();
                }
                
                //if autoPump is on
                if(status.autoPumpOn === "ON"){
                    app.autoPumpOn();
                }
                
                if(status.autoPumpOn === "OFF" && status.pumpOn === "OFF"){
                    app.isPumpOn = "ON";
                    app.waterOff();
                }else{
                    app.isPumpOn = "OFF";
                }
            });
        },2000);

    },

    initGPIO: function(){
        //this is for relay channel (water pump)
        gpio.setup(37, gpio.DIR_HIGH);
    },

    //this function auto-waters if the target moisture level is not being met.
    autoPumpOn: function(){
        //check to make sure autoPump isnt already on
        if(app.currentSoil < app.currentTargetSoil && app.isAutoPumpOn === "ON"){
            console.log("turning pump relay auto on init");
            app.isAutoPumpOn = "OFF";
            // app.pumpOn();
            app.checkNotif();
            //keep running pump until soil moisture meets target
            app.autoPumpInterval = setInterval(function(){
                console.log("turning pump relay auto on running");
                app.pumpOn();
            },5000); 
        }
        //if autoPump is already running, and soil reaches appropriate moisture level, turn off watering
        else if (app.currentSoil >= app.currentTargetSoil && app.isAutoPumpOn === "OFF"){
            //turn off pump interval
            clearInterval(app.autoPumpInterval)
            app.isAutoPumpOn = "ON";
            app.waterOff();
        }              
    },

    //close relay circuit for channel pin 37
    pumpOn: function(){
        
        //check to see if pump is already running
        if(app.isPumpOn === "OFF"){
            console.log("turning pump relay on running");
            app.isPumpOn = "ON";
            gpio.write(37, true);
            // setTimeout(function(){ 
                // request({       
                //     method: 'POST',
                //     url: urlRelayUpdate,
                //     data: {
                //         "pumpOn":"OFF",
                //         "autoPumpOn":"OFF"
                //         }
                //     }, function(err, res, body) {
                //         if(err){
                //             return(err);
                //         }
                //     app.pumpOff();
                //     //console.log(body);
                // });
            // },10000)
            
            var af = 0;
            app.autoPumpSetTimeout = setInterval(function(){
                if(app.isPumpOn === "ON") {
                    af = af + 1;
                    console.log("Timer: " + af);
                    app.currentSetTimeout = af
                }else {
                    app.currentSetTimeout = af
                    clearInterval(app.autoPumpSetTimeout)
                }
            },2000);
        }
    },

    //open relay circuit for channel pin 37
    pumpOff: function(){
        if(app.isPumpOn === "ON"){
            console.log("turning pump relay off");
            app.isPumpOn = "OFF";
            gpio.write(37, false);
        }
    },

    waterOff: function(){
        gpio.write(37, false);
    },

    checkNotif: function(){
        if(app.currentTargetSoil > app.currentSoil){
            request({       
                method: 'GET',
                url: urlNotif
            }, function(err, res, body) {
                if(err){
                    return(err);
                }
                console.log("send notif")
            });
        }else if (app.currentTargetSoil <= app.currentSoil){
            console.log("not send notif")
        } 
    }
}

app.initApp();
