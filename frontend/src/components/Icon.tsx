import React from 'react';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import type { ComponentProps } from 'react';

type MDIName = ComponentProps<typeof MaterialDesignIcons>['name'];

export type IconProps = {
  name: MDIName;
  size?: number;
  color?: string;
  style?: any;
};

export function Icon({ name, size = 22, color = '#F8FAFC', style }: IconProps) {
  return <MaterialDesignIcons name={name} size={size} color={color} style={style} />;
}

export default Icon;
