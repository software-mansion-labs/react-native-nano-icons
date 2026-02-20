import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Dimensions,
  Platform,
} from "react-native";
import React, { ReactNode } from "react";
import createIconSetFromIcoMoon from "@react-native-vector-icons/icomoon";
import icomoonGlyphmap from "./assets/Iconmoon.icomoon.json";
import { Icon } from "Icon";

//@ts-ignore
const IcoMoonIcon = createIconSetFromIcoMoon(icomoonGlyphmap, {
  postScriptName: "Untitled",
  fontFileName: "Untitled.ttf",
  fontSource: "./assets/Untitled.ttf",
});

const FASTICON_CODEPOINTS = {
  usFlag: 61697,
  triangleOld: 61698,
  triangleCropped: 61699,
  triangle: 61700,
  star: 61701,
  "person-walking": 61702,
  message: 61703,
  "complicated-icon-2": 61704,
  "complicated-icon-1": 61705,
  AO: 61706,
};

const Fantasticon = ({
  codePoint,
  size,
}: {
  codePoint: number;
  size: number;
}) => {
  return (
    <Text
      style={{
        fontFamily: Platform.select({ ios: "icons", android: "Fantasticon" }),
        fontSize: size,
      }}
    >
      {String.fromCodePoint(codePoint)}
    </Text>
  );
};

const { width } = Dimensions.get("window");

const FontsComparision = () => {
  return (
    <View style={[{ width }, styles.tableContainer]}>
      {/* Row with individual icon colors */}
      <TableRow rowBgColor="#b3b3b3">
        <Text style={{ textAlign: "center", textAlignVertical: "center" }}>
          SVG
        </Text>
        <Text style={{ textAlign: "center", textAlignVertical: "center" }}>
          fantasticon
        </Text>
        <Text style={{ textAlign: "center", textAlignVertical: "center" }}>
          IcoMoon
        </Text>
        <Text style={{ textAlign: "center", textAlignVertical: "center" }}>
          Nanoicon
        </Text>
      </TableRow>

      <IconComparisonRow icon="star" />
      <IconComparisonRow icon="triangleCropped" />
      <IconComparisonRow icon="complicated-icon-1" />
      <IconComparisonRow icon="complicated-icon-2" />
      <IconComparisonRow icon="AO" />
      <IconComparisonRow icon="usFlag" />
      <IconComparisonRow icon="person-walking" />
    </View>
  );
};

export default FontsComparision;

interface TableCellProps {
  children: ReactNode;
  bgColor?: string;
  isLast?: boolean;
}

interface TableRowProps {
  children: ReactNode; // Expecting 4 children
  rowBgColor?: string;
  style?: StyleProp<ViewStyle>;
}

const TableCell: React.FC<TableCellProps> = ({
  children,
  bgColor = "transparent",
  isLast = false,
}) => (
  <View
    style={[
      styles.cell,
      { backgroundColor: bgColor },
      isLast && { borderRightWidth: 0 },
    ]}
  >
    {children}
  </View>
);

const TableRow: React.FC<TableRowProps> = ({
  children,
  rowBgColor = "transparent",
  style,
}) => {
  return (
    <View style={[styles.row, { backgroundColor: rowBgColor }, style]}>
      {React.Children.map(children, (child, index) => (
        <TableCell
          key={index}
          isLast={index === React.Children.count(children) - 1}
        >
          {child}
        </TableCell>
      ))}
    </View>
  );
};

const IconComparisonRow = ({
  icon,
}: {
  icon: keyof typeof FASTICON_CODEPOINTS;
}) => {
  return (
    <TableRow>
      <Text
        style={{
          textAlign: "center",
          textAlignVertical: "center",
        }}
      >
        {`${icon}.svg`}
      </Text>
      <View style={{ gap: 10, justifyContent: "center", alignItems: "center" }}>
        <Fantasticon codePoint={FASTICON_CODEPOINTS[icon]} size={50} />
        <Text style={{ fontSize: 12 }}>
          inline
          <Fantasticon codePoint={FASTICON_CODEPOINTS[icon]} size={12} />
          inline
        </Text>
      </View>
      <View style={{ gap: 10, justifyContent: "center", alignItems: "center" }}>
        <IcoMoonIcon name={icon} size={50} />
        <Text style={{ fontSize: 12 }}>
          inline
          <IcoMoonIcon name={icon} size={12} />
          inline
        </Text>
      </View>
      <View style={{ gap: 10, justifyContent: "center", alignItems: "center" }}>
        <Icon name={icon} size={50} />
        <Text style={{ fontSize: 12 }}>
          inline
          <Icon name={icon} size={12} />
          inline
        </Text>
      </View>
    </TableRow>
  );
};

const styles = StyleSheet.create({
  tableContainer: {
    // width: "100%",
    borderTopWidth: 1,
    borderColor: "#000",
  },
  row: {
    width: "100%",
    flex: 1,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#000",
  },
  cell: {
    flex: 1,
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderColor: "#000",
  },
});
