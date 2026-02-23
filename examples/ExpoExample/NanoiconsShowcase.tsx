import { View, Text } from "react-native";
import React from "react";
import { Icon } from "Icon";

const NanoiconsShowcase = () => {
  return (
    <View
      style={{
        flexDirection: "row",
        columnGap: 20,
        justifyContent: "space-around",
        width: "100%",
      }}
    >
      <View
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Text style={{ marginBottom: 20 }}>Nanoicons examples</Text>
        <View style={{ borderWidth: 1, borderColor: "red" }}>
          <Icon name="AO" size={52} />
        </View>

        <Text>
          inline <Icon name="AO" />
          icon test
        </Text>

        <View style={{ borderWidth: 1, borderColor: "red" }}>
          <Icon name="message" size={52} colorPalette={["#7e0c0c"]} />
        </View>

        <Text>
          inline
          <Icon name="triangle" size={20} colorPalette={["blue"]} />
          icon test
        </Text>

        <View style={{ borderWidth: 1, borderColor: "red" }}>
          <Icon name="triangle" size={52} colorPalette={["blue"]} />
        </View>
        <View style={{ borderWidth: 1, borderColor: "red" }}>
          <Icon name="usFlag" size={52} />
        </View>

        <View style={{ borderWidth: 1, borderColor: "red" }}>
          <Icon name="star" size={52} />
        </View>
        <View style={{ borderWidth: 1, borderColor: "red" }}>
          <Icon name="triangleCropped" size={52} colorPalette={["green"]} />
        </View>
        <View
          style={{
            borderWidth: 1,
            borderColor: "red",
            padding: 20,
            backgroundColor: "#000",
          }}
        >
          <Icon name="complicated-icon-1" size={52} colorPalette={["blue"]} />
        </View>
        <Text
          style={{
            backgroundColor: "red",
            fontSize: 32,
          }}
        >
          nanoiconj
          <Icon name="usFlag" size={20} allowFontScaling={true} />
          <Text style={{ backgroundColor: "#626262" }}>emojiK</Text>
          <Text
            style={{
              backgroundColor: "#8c1717",
            }}
          >
            🇺🇸
          </Text>
        </Text>
        <Text
          style={{
            fontSize: 64,
            backgroundColor: "red",
            verticalAlign: "bottom",
          }}
        >
          inline
          <Icon
            name="complicated-icon-2"
            size={64}
            colorPalette={["#2c14e0"]}
          />
          <Text style={{ backgroundColor: "#626262" }}>icon</Text>
        </Text>
        <View style={{ flexDirection: "row" }}>
          <View style={{ alignItems: "center" }}>
            <Icon name="person-walking" size={150} />
            <Text style={{ textAlign: "center", maxWidth: "60%" }}>
              ⬆️ "person-walking" original
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Icon
              name="person-walking"
              size={150}
              colorPalette={[
                "#FCC9A7",
                "#1F252A",
                "#FCC9A7",
                "#1F252A",
                "#092330",
                "#0C2C40",
                "#FCC9A7",
                "#FCC9A7",
                "#1C2226",
                "#123036",
                "#123036",
                "#FCF3F0",
                "#FCC9A7",
                "#F4BE9A",
                "#FCC9A7",
                "#FCC9A7",
                "#1C2226",
                "#FCC9A7",
                "red",
                "#0C2C40",
                "#FCF3F0",
                "#EADDD8",
                "#AFAFAF",
                "#D1D1D1",
                "#FCC9A7",
                "#FCC9A7",
                "#123036",
                "#EADDD8",
                "#EADDD8",
                "#1C2226",
              ]}
            />
            <Text style={{ textAlign: "center", maxWidth: "60%" }}>
              ⬆️ "person-walking" shirt color override via colorPalette prop
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default NanoiconsShowcase;
