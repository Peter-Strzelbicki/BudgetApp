import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { router } from 'expo-router';

import {
  BarChart
} from 'react-native-gifted-charts';



const screenWidth = Dimensions.get("window").width;



export default function HomeScreen() {


  const monthlySpending = [

    {
      value:3200,
      label:"Jan",
      frontColor:"#4CAF50"
    },

    {
      value:3900,
      label:"Feb",
      frontColor:"#F44336"
    },

    {
      value:2800,
      label:"Mar",
      frontColor:"#4CAF50"
    },

    {
      value:4200,
      label:"Apr",
      frontColor:"#F44336"
    },

    {
      value:3100,
      label:"May",
      frontColor:"#4CAF50"
    },

    {
      value:3500,
      label:"Jun",
      frontColor:"#4CAF50"
    },

    {
      value:3450,
      label:"Jul",
      frontColor:"#4CAF50"
    },

    {
      value:3600,
      label:"Aug",
      frontColor:"#F44336"
    },

    {
      value:3300,
      label:"Sep",
      frontColor:"#4CAF50"
    },

    {
      value:4100,
      label:"Oct",
      frontColor:"#F44336"
    },

    {
      value:2900,
      label:"Nov",
      frontColor:"#4CAF50"
    },

    {
      value:3800,
      label:"Dec",
      frontColor:"#F44336"
    }

  ];



  return (

    <ScrollView style={styles.container}>


      <Text style={styles.title}>
        Home Budget
      </Text>



      <Text style={styles.subtitle}>
        2026 Overview
      </Text>






      {/* Summary Cards */}


      <View style={styles.summaryRow}>


        <View style={styles.summaryCard}>

          <Text style={styles.label}>
            Monthly Budget
          </Text>

          <Text style={styles.amount}>
            $3,500
          </Text>

        </View>




        <View style={styles.summaryCard}>

          <Text style={styles.label}>
            Avg Spending
          </Text>

          <Text style={styles.amount}>
            $3,450
          </Text>

        </View>




        <View style={styles.summaryCard}>

          <Text style={styles.label}>
            Year Total
          </Text>

          <Text style={styles.amount}>
            $41,400
          </Text>

        </View>


      </View>








      {/* Chart */}



      <View style={styles.chartCard}>


        <Text style={styles.sectionTitle}>
          2026 Spending vs Budget
        </Text>



        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
        >


          <BarChart


            data={monthlySpending}



            width={screenWidth - 35}



            height={280}



            barWidth={18}



            spacing={6}



            initialSpacing={10}



            endSpacing={10}



            roundedTop



            noOfSections={5}



            maxValue={5000}



            stepValue={1000}



            yAxisLabelPrefix="$"



            yAxisTextStyle={{

              color:"#AAAAAA"

            }}



            xAxisLabelTextStyle={{

              color:"#AAAAAA",

              fontSize:10

            }}



            showReferenceLine1={true}



            referenceLine1Position={3500}



            referenceLine1Config={{

              color:"#FF5252",

              thickness:2,

              dashWidth:6,

              dashGap:6

            }}



            backgroundColor="#1E1E1E"



            isAnimated



          />


        </ScrollView>




        <Text style={styles.legend}>
          - - - Monthly Budget: $3,500
        </Text>



      </View>









      {/* Quick Actions */}



      <Text style={styles.sectionTitle}>
        Quick Actions
      </Text>







      <Pressable

        style={styles.button}

        onPress={() =>
          router.push('/transactions')
        }

      >

        <Text style={styles.buttonText}>
          💳 Transactions
        </Text>

      </Pressable>







      <Pressable

        style={styles.button}

        onPress={() =>
          router.push('/add-transaction')
        }

      >

        <Text style={styles.buttonText}>
          ➕ Add Transaction
        </Text>

      </Pressable>







      <Pressable

        style={styles.button}

        onPress={() =>
          router.push('/budget')
        }

      >

        <Text style={styles.buttonText}>
          📊 Budget
        </Text>

      </Pressable>







      <Pressable

        style={styles.button}

        onPress={() =>
          router.push('/goals')
        }

      >

        <Text style={styles.buttonText}>
          🎯 Goals
        </Text>

      </Pressable>



    </ScrollView>

  );

}









const styles = StyleSheet.create({



  container:{

    flex:1,

    backgroundColor:"#121212",

    paddingHorizontal:20

  },



  title:{

    fontSize:34,

    fontWeight:"bold",

    color:"#FFFFFF",

    marginTop:40

  },



  subtitle:{

    fontSize:20,

    color:"#AAAAAA",

    marginBottom:20

  },



  summaryRow:{

    flexDirection:"row",

    justifyContent:"space-between",

    marginBottom:25

  },



  summaryCard:{

    backgroundColor:"#1E1E1E",

    width:"31%",

    padding:12,

    borderRadius:15

  },



  label:{

    fontSize:12,

    color:"#AAAAAA"

  },



  amount:{

    fontSize:17,

    fontWeight:"bold",

    color:"#FFFFFF",

    marginTop:8

  },



  chartCard:{

    backgroundColor:"#1E1E1E",

    padding:15,

    borderRadius:15,

    marginBottom:20

  },



  sectionTitle:{

    fontSize:24,

    fontWeight:"bold",

    color:"#FFFFFF",

    marginBottom:15,

    marginTop:10

  },



  legend:{

    color:"#AAAAAA",

    marginTop:10

  },



  button:{

    backgroundColor:"#1E1E1E",

    padding:18,

    borderRadius:15,

    marginBottom:12

  },



  buttonText:{

    color:"#FFFFFF",

    fontSize:18,

    fontWeight:"600"

  }


});