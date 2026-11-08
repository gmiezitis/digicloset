import React from 'react';
import { View, Text } from 'react-native';
import type { UsageStat } from './insights';
import { styles } from './styles';

export function StatCard(props: { label: string; value: string; helper?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{props.label}</Text>
      <Text style={styles.statValue}>{props.value}</Text>
      {props.helper ? <Text style={styles.statHelper}>{props.helper}</Text> : null}
    </View>
  );
}

export function ListRow(props: { title: string; subtitle: string }) {
  return (
    <View style={styles.cardRow}>
      <View>
        <Text style={styles.rowTitle}>{props.title}</Text>
        <Text style={styles.rowSubtitle}>{props.subtitle}</Text>
      </View>
    </View>
  );
}

export function UsageRow({ entry }: { entry: UsageStat }) {
  return (
    <View style={styles.cardRow}>
      <View>
        <Text style={styles.rowTitle}>{entry.item?.name ?? 'Archived item'}</Text>
        <Text style={styles.rowSubtitle}>{entry.count} wears logged</Text>
      </View>
    </View>
  );
}




