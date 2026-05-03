import { View, Text } from '@tarojs/components'
import './index.less'

export default function Loading({ text = '加载中…' }) {
  return (
    <View className='loading-wrap'>
      <View className='pulse-dot' />
      <Text className='loading-text'>{text}</Text>
    </View>
  )
}
