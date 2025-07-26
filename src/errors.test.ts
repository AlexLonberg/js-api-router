import { test, expect } from 'vitest'
import { errorDetails, UnknownError } from './errors.js'

test('error', () => {
  const message = errorDetails.UnknownError('url http//some.site')

  // Явное приведение
  const asString = message.toString()
  const expectedString = 'name: ApiRouter.UnknownError\n' +
    'code: 0\n' +
    'message: url http//some.site'
  expect(asString).toBe(expectedString)

  // Автоматическое приведение
  expect(`${message}`).toBe(expectedString)

  // Реальная ошибка наследуемая от Error
  const realError = new UnknownError(errorDetails.UnknownError('url http//some.site'))
  // Здесь может быть стек и другие данные, например cause, поэтому проверим только ожидаемое начало сообщения
  expect(`${realError}`).toContain(expectedString)
})
