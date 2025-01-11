package utils

const maxLength = 16

func IsValidRoomId(roomId string) bool {
	if len(roomId) != maxLength {
		return false
	}

	for _, char := range roomId {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
			return false
		}
	}

	return true
}
