import reactDoctor from "eslint-plugin-react-doctor"

const toAdvisoryConfig = (config) => ({
  ...config,
  rules: Object.fromEntries(
    Object.keys(config.rules ?? {}).map((ruleName) => [ruleName, "warn"]),
  ),
})

export const advisoryReactDoctorConfigs = [
  toAdvisoryConfig(reactDoctor.configs.recommended),
]

export const advisoryNextReactDoctorConfigs = [
  ...advisoryReactDoctorConfigs,
  toAdvisoryConfig(reactDoctor.configs.next),
  toAdvisoryConfig(reactDoctor.configs["tanstack-query"]),
]
